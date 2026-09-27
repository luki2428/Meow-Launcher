import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import log from 'electron-log/main'
import type { LauncherProgress } from '../../shared/game'
import type { InstanceService } from '../minecraft/InstanceService'
import { LauncherError } from '../shared/LauncherError'
import { downloadVerified, fetchJson, trustedUrl } from '../shared/network'
import type { InstanceConfig } from '../shared/validation'
import { manifestSchema, type ManagedFile, type PackManifest } from './manifest'
import { ModpackStore } from './ModpackStore'

type Report = (progress: LauncherProgress) => void
const key = (file: ManagedFile): string => file.path.toLowerCase()
const preservesEdits = (file: ManagedFile): boolean => !file.path.startsWith('mods/')

export class ModpackService {
  readonly store: ModpackStore
  constructor(private readonly instances: InstanceService) {
    this.store = new ModpackStore(instances)
  }

  async installedVersion(): Promise<string | null> {
    try {
      const state = await this.store.read()
      return state.pending ? null : state.version
    } catch {
      return null
    }
  }

  async check(
    config: InstanceConfig,
    report: Report,
    signal?: AbortSignal
  ): Promise<PackManifest | null> {
    if (!config.modpack) return null
    report({ stage: 'checking', message: 'Sprawdzanie aktualizacji paczki…' })
    log.info('Modpack: checking manifest')
    try {
      const source = config.modpack
      const manifest = manifestSchema.parse(
        await fetchJson(source.manifestUrl, source.allowedHosts, signal)
      )
      // Validate all URLs before touching any game files, including unchanged entries.
      for (const file of manifest.files) trustedUrl(file.url, source.allowedHosts)
      return manifest
    } catch (error) {
      signal?.throwIfAborted()
      throw new LauncherError(
        'MODPACK_MANIFEST_FAILED',
        'Nie udało się sprawdzić aktualizacji paczki. Sprawdź połączenie i konfigurację manifestu.',
        error
      )
    }
  }

  async synchronize(
    config: InstanceConfig,
    manifest: PackManifest,
    report: Report,
    signal?: AbortSignal
  ): Promise<void> {
    if (!config.modpack) throw new Error('Missing modpack source')
    const previous = await this.store.read()
    report({
      stage: 'checking',
      message:
        previous.version === manifest.version && !previous.pending
          ? `Weryfikacja paczki ${manifest.version}…`
          : `Aktualizacja paczki: ${previous.version ?? 'brak'} → ${manifest.version}…`
    })
    const known = new Map(previous.files.map((file) => [key(file), file]))
    // Recover ownership after an interrupted commit, even if the remote manifest changed.
    for (const file of previous.pending ?? []) {
      const actual = await this.store.hash(await this.store.target(file.path))
      if (!known.has(key(file)) || actual === file.sha256) known.set(key(file), file)
    }
    const current = new Set(manifest.files.map(key))
    const staged: { file: ManagedFile; path: string }[] = []
    const managed: ManagedFile[] = []
    const staging = await this.store.checked(join(this.instances.root('main'), 'modpack-staging'))
    await mkdir(staging, { recursive: true })
    let preserved = 0
    try {
      for (const [index, file] of manifest.files.entries()) {
        signal?.throwIfAborted()
        report({
          stage: 'verifying',
          message: `Sprawdzanie ${file.path}`,
          currentFile: file.path,
          progress: Math.floor((index / Math.max(1, manifest.files.length)) * 100)
        })
        const target = await this.store.target(file.path)
        const actual = await this.store.hash(target)
        const old = known.get(key(file))
        if (
          actual !== null &&
          actual !== file.sha256 &&
          preservesEdits(file) &&
          actual !== old?.sha256
        ) {
          preserved++
          // Keep the original baseline; never claim ownership of a user's existing file.
          if (old) managed.push(old)
          continue
        }
        managed.push({ path: file.path, sha256: file.sha256 })
        if (actual === file.sha256) continue
        const path = await this.store.checked(join(staging, `${index}.download`))
        await this.store.checked(path + '.tmp')
        staged.push({ file, path })
        log.info('Modpack: downloading', file.path)
        await downloadVerified(
          file.url,
          config.modpack.allowedHosts,
          path,
          file.sha256,
          file.size,
          (progress, bytesPerSecond) =>
            report({
              stage: 'downloading',
              message: `Pobieranie ${file.path}`,
              currentFile: file.path,
              progress,
              bytesPerSecond
            }),
          signal
        )
      }
      signal?.throwIfAborted()
      // All downloads are verified before replacement/deletion starts. A journal prevents
      // partially committed files becoming untracked if the app or machine stops here.
      report({ stage: 'installing', message: `Instalowanie paczki ${manifest.version}…` })
      await this.store.write({
        version: previous.version,
        files: [...known.values()],
        pending: managed
      })
      for (const { file, path } of staged) {
        const target = await this.store.target(file.path)
        await mkdir(dirname(target), { recursive: true })
        await rename(await this.store.checked(path), target)
      }
      for (const file of known.values()) {
        if (current.has(key(file))) continue
        const target = await this.store.target(file.path)
        const actual = await this.store.hash(target)
        if (preservesEdits(file) && actual !== null && actual !== file.sha256) continue
        await rm(target, { force: true })
      }
      await this.store.write({ version: manifest.version, files: managed })
      log.info(
        'Modpack: ready',
        manifest.version,
        'downloaded',
        staged.length,
        'preserved',
        preserved
      )
      report({
        stage: 'installing',
        progress: 100,
        message: `Paczka ${manifest.version} jest aktualna.${preserved ? ` Zachowano lokalne konfiguracje: ${preserved}.` : ''}`
      })
    } catch (error) {
      if (signal?.aborted)
        throw new LauncherError('MODPACK_CANCELLED', 'Aktualizacja paczki została anulowana.')
      if (error instanceof LauncherError) throw error
      throw new LauncherError(
        'MODPACK_UPDATE_FAILED',
        'Nie udało się zaktualizować paczki. Sprawdź połączenie, uprawnienia i miejsce na dysku; następnie spróbuj ponownie.',
        error
      )
    } finally {
      for (const { path } of staged) {
        // Only remove the individual staging files created by this operation.
        await rm(await this.store.checked(path), { force: true }).catch(() => {})
      }
    }
  }
}
