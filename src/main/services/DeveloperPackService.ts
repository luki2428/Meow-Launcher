import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { z } from 'zod'
import type { DeveloperPackInfo } from '../../shared/developer'
import { LauncherError } from '../shared/LauncherError'
import type { InstanceConfig } from '../shared/validation'
import type { SettingsService } from './SettingsService'

const neoVersion = z.string().regex(/^21\.1\.[0-9]{1,6}(?:-beta)?$/)
const optionsSchema = z.discriminatedUnion('loader', [
  z.object({ loader: z.literal('vanilla'), loaderVersion: z.string().max(100) }).strict(),
  z.object({ loader: z.literal('neoforge'), loaderVersion: neoVersion }).strict()
])
export const developerManifestSchema = z
  .object({
    version: z.literal('local-dev'),
    minecraft: z.literal('1.21.1'),
    java: z.object({ majorVersion: z.literal(21), architecture: z.literal('x64') }).strict(),
    loader: z.discriminatedUnion('type', [
      z.object({ type: z.literal('vanilla') }).strict(),
      z.object({ type: z.literal('neoforge'), version: neoVersion }).strict()
    ]),
    files: z.tuple([])
  })
  .strict()

// Local-only source. Never fall back to a remote manifest if this one is invalid.
export class DeveloperPackService {
  constructor(private readonly settings: SettingsService) {}

  get enabled(): boolean {
    return this.settings.getSettings().developerMode
  }
  get directory(): string {
    return join(this.settings.getSettings().installationDirectory, 'developer')
  }
  get manifestPath(): string {
    return join(this.directory, 'manifest.json')
  }

  private assertLocalPath(path: string): void {
    const root = resolve(this.settings.getSettings().installationDirectory)
    const target = resolve(path)
    if (!target.startsWith(root + sep))
      throw new LauncherError('INVALID_PATH', 'Nieprawidłowy folder testowy.')
    let current = root
    for (const part of target.slice(root.length + 1).split(sep)) {
      current = join(current, part)
      try {
        if (lstatSync(current).isSymbolicLink())
          throw new LauncherError('INVALID_PATH', 'Pliki testowe nie mogą być dowiązaniami.')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
  }

  read(): z.infer<typeof developerManifestSchema> {
    this.assertLocalPath(this.manifestPath)
    try {
      if (lstatSync(this.manifestPath).size > 64 * 1024) throw new Error('Manifest too large')
      return developerManifestSchema.parse(JSON.parse(readFileSync(this.manifestPath, 'utf8')))
    } catch {
      throw new LauncherError(
        'LOCAL_PACK_INVALID',
        'Brakuje poprawnego lokalnego manifestu. Wygeneruj paczkę w Ustawienia → Deweloper.'
      )
    }
  }

  config(): InstanceConfig {
    const manifest = this.read()
    return {
      id: 'main',
      minecraft: manifest.minecraft,
      java: manifest.java,
      loader: manifest.loader,
      playEnabled: true
    }
  }

  generate(input: unknown): void {
    const options = optionsSchema.safeParse(input)
    if (!options.success)
      throw new LauncherError(
        'INVALID_LOCAL_PACK',
        'Dla Minecrafta 1.21.1 podaj wersję NeoForge 21.1.x, np. 21.1.172.'
      )
    const manifest = developerManifestSchema.parse({
      version: 'local-dev',
      minecraft: '1.21.1',
      java: { majorVersion: 21, architecture: 'x64' },
      loader:
        options.data.loader === 'vanilla'
          ? { type: 'vanilla' }
          : { type: 'neoforge', version: options.data.loaderVersion },
      files: []
    })
    this.assertLocalPath(this.manifestPath)
    this.assertLocalPath(this.manifestPath + '.tmp')
    mkdirSync(this.directory, { recursive: true })
    writeFileSync(this.manifestPath + '.tmp', JSON.stringify(manifest, null, 2) + '\n', 'utf8')
    renameSync(this.manifestPath + '.tmp', this.manifestPath)
  }

  info(): DeveloperPackInfo {
    let description: string | null = null
    let error: string | null = null
    const exists = existsSync(this.manifestPath)
    if (exists) {
      try {
        const manifest = this.read()
        description = `Minecraft ${manifest.minecraft} · ${manifest.loader.type === 'vanilla' ? 'Vanilla' : `NeoForge ${manifest.loader.version}`}`
      } catch {
        error = 'Lokalny manifest jest niepoprawny. Wygeneruj go ponownie.'
      }
    }
    return {
      manifestPath: this.manifestPath,
      gameDirectory: join(
        this.settings.getSettings().installationDirectory,
        'instances',
        'developer',
        'game'
      ),
      exists,
      description,
      error
    }
  }
}
