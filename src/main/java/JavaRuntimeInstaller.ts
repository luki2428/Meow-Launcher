import { mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { join, dirname } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { open, openEntryReadStream, walkEntriesGenerator } from '@xmcl/unzip'
import { z } from 'zod'
import log from 'electron-log/main'
import { downloadVerified, fetchJson } from '../shared/network'
import { inside, type InstanceConfig } from '../shared/validation'
import type { LauncherProgress } from '../../shared/game'
import { LauncherError } from '../shared/LauncherError'

const hosts = [
  'api.adoptium.net',
  'github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com'
]
const assetsSchema = z
  .array(
    z.object({
      binary: z.object({
        architecture: z.literal('x64'),
        os: z.literal('windows'),
        image_type: z.literal('jdk'),
        package: z.object({
          link: z.string().url(),
          checksum: z.string().regex(/^[a-f0-9]{64}$/i),
          size: z
            .number()
            .int()
            .positive()
            .max(600 * 1024 ** 2)
        })
      })
    })
  )
  .min(1)

export class JavaRuntimeInstaller {
  async install(
    config: InstanceConfig,
    runtime: string,
    verify: (path: string) => Promise<boolean>,
    report: (progress: LauncherProgress) => void,
    signal?: AbortSignal
  ): Promise<void> {
    if (process.platform !== 'win32' || process.arch !== config.java.architecture)
      throw new LauncherError(
        'JAVA_RUNTIME_UNSUPPORTED_PLATFORM',
        'Automatyczny runtime obsługuje obecnie Windows x64.'
      )
    const parent = dirname(runtime)
    await mkdir(parent, { recursive: true })
    const stage = await mkdtemp(join(parent, 'java-install-'))
    const backup = join(parent, 'java-previous')
    try {
      log.info('Java: download metadata', config.java.majorVersion)
      const assets = assetsSchema.parse(
        await fetchJson(
          `https://api.adoptium.net/v3/assets/latest/${config.java.majorVersion}/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse`,
          hosts,
          signal
        )
      )
      const pack = assets[0].binary.package
      const archive = join(stage, 'runtime.zip')
      await downloadVerified(
        pack.link,
        hosts,
        archive,
        pack.checksum,
        pack.size,
        (progress) => report({ stage: 'java', progress, message: 'Pobieranie Java Runtime…' }),
        signal
      )
      report({ stage: 'java', message: `Instalowanie Java ${config.java.majorVersion}…` })
      const extracted = join(stage, 'extracted')
      await mkdir(extracted)
      const zip = await open(archive, { lazyEntries: true, autoClose: false })
      try {
        let expanded = 0
        let count = 0
        for await (const entry of walkEntriesGenerator(zip)) {
          signal?.throwIfAborted()
          if (++count > 50_000 || (expanded += entry.uncompressedSize) > 2 * 1024 ** 3)
            throw new Error('Archive too large')
          const path = inside(extracted, entry.fileName)
          const mode = (entry.externalFileAttributes >>> 16) & 0xf000
          if (mode === 0xa000) throw new Error('Archive symlink rejected')
          if (entry.fileName.endsWith('/')) {
            await mkdir(path, { recursive: true })
            continue
          }
          await mkdir(dirname(path), { recursive: true })
          await pipeline(
            await openEntryReadStream(zip, entry),
            createWriteStream(path, { flags: 'wx' }),
            { signal }
          )
        }
      } finally {
        zip.close()
      }
      const roots = await readdir(extracted, { withFileTypes: true })
      if (roots.length !== 1 || !roots[0].isDirectory()) throw new Error('Invalid runtime archive')
      const candidate = join(extracted, roots[0].name)
      if (!(await verify(candidate)))
        throw new LauncherError(
          'JAVA_RUNTIME_INVALID',
          'Pobrany runtime Java ma nieprawidłową wersję lub architekturę.'
        )
      signal?.throwIfAborted()
      log.info('Java: verified runtime', config.java.majorVersion)
      await rm(backup, { recursive: true, force: true })
      let moved = false
      try {
        await rename(runtime, backup)
        moved = true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      try {
        await rename(candidate, runtime)
      } catch (error) {
        if (moved) await rename(backup, runtime)
        throw error
      }
      await rm(backup, { recursive: true, force: true })
    } catch (error) {
      if (error instanceof LauncherError) throw error
      throw new LauncherError(
        'JAVA_RUNTIME_DOWNLOAD_FAILED',
        'Nie udało się pobrać lub zainstalować Java Runtime.'
      )
    } finally {
      await rm(stage, { recursive: true, force: true })
    }
  }
}
