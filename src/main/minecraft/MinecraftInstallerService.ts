import { readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { Version, LaunchPrecheck, MinecraftFolder, type ResolvedVersion } from '@xmcl/core'
import {
  installVersionTask,
  installDependenciesTask,
  installFabric,
  installForgeTask,
  installNeoForgedTask
} from '@xmcl/installer'
import type { LibraryOptions } from '@xmcl/installer'
import type { Task } from '@xmcl/task'
import { z } from 'zod'
import log from 'electron-log/main'
import type { InstanceConfig } from '../shared/validation'
import { inside, versionSchema } from '../shared/validation'
import { fetchJson, trustedUrl } from '../shared/network'
import { LauncherError } from '../shared/LauncherError'
import type { LauncherProgress } from '../../shared/game'
import { runXmclTask } from './XmclTaskRunner'

export class MinecraftInstallerService {
  private libraryOptions(game: string): LibraryOptions {
    return {
      libraryHost: (library) => {
        inside(game, 'libraries/' + library.download.path)
        const url = new URL(library.download.url)
        // XMCL 6.1.2 still includes an HTTP Forge fallback; replace it explicitly.
        if (url.hostname === 'files.minecraftforge.net') {
          url.hostname = 'maven.minecraftforge.net'
          url.pathname = url.pathname.replace(/^\/maven\//, '/')
        }
        url.protocol = 'https:'
        trustedUrl(url.href, [
          'libraries.minecraft.net',
          'maven.minecraftforge.net',
          'maven.neoforged.net',
          'maven.fabricmc.net',
          'repo1.maven.org',
          'repo.maven.apache.org'
        ])
        return [url.href]
      }
    }
  }
  private async run<T>(
    factory: () => Task<T>,
    stage: LauncherProgress['stage'],
    report: (progress: LauncherProgress) => void,
    game: string
  ): Promise<T> {
    return runXmclTask(factory, game, stage, report)
  }
  async ensureMinecraftInstalled(
    config: InstanceConfig,
    game: string,
    java: string,
    report: (progress: LauncherProgress) => void
  ): Promise<ResolvedVersion> {
    log.info('Minecraft: check/install', config.minecraft)
    try {
      let version: ResolvedVersion | undefined
      try {
        version = await Version.parse(game, config.minecraft)
        await LaunchPrecheck.checkVersion(new MinecraftFolder(game), version, {
          gamePath: game,
          javaPath: java,
          version
        })
      } catch {
        version = undefined
      }
      if (!version) {
        const manifest = z
          .object({
            versions: z.array(z.object({ id: z.string().max(200), url: z.string().url() }))
          })
          .parse(
            await fetchJson('https://launchermeta.mojang.com/mc/game/version_manifest.json', [
              'launchermeta.mojang.com',
              'piston-meta.mojang.com'
            ])
          )
        const meta = manifest.versions.find((v) => v.id === config.minecraft)
        if (!meta)
          throw new LauncherError(
            'MINECRAFT_INSTALL_FAILED',
            'Nie znaleziono skonfigurowanej wersji Minecraft.'
          )
        // Validate the download origin before handing the official manifest to XMCL.
        const remote = await fetchJson(meta.url, [
          'piston-meta.mojang.com',
          'launchermeta.mojang.com'
        ])
        z.object({
          id: z.literal(config.minecraft),
          mainClass: z.string(),
          libraries: z.array(z.object({ name: z.string().regex(/^[A-Za-z0-9_.:+-]+$/) })),
          downloads: z.object({
            client: z.object({
              url: z.url({ protocol: /^https$/ }),
              sha1: z.string().regex(/^[a-f0-9]{40}$/),
              size: z.number().positive()
            })
          })
        }).parse(remote)
        version = await this.run(() => installVersionTask(meta, game), 'minecraft', report, game)
      }
      const installed = version
      version = await this.run(
        () => installDependenciesTask(installed, this.libraryOptions(game)),
        'minecraft',
        report,
        game
      )
      return version
    } catch (error) {
      if (error instanceof LauncherError) throw error
      throw new LauncherError(
        'MINECRAFT_INSTALL_FAILED',
        'Nie udało się zainstalować lub naprawić Minecrafta. Sprawdź połączenie i miejsce na dysku.',
        error
      )
    }
  }

  async ensureLoaderInstalled(
    config: InstanceConfig,
    game: string,
    java: string,
    report: (progress: LauncherProgress) => void
  ): Promise<string> {
    if (config.loader.type === 'vanilla') return config.minecraft
    log.info('Loader: check/install', config.loader.type, config.loader.version)
    const fingerprint = JSON.stringify({ minecraft: config.minecraft, loader: config.loader })
    const marker = join(game, 'launcher-loader.json')
    const loader = config.loader
    try {
      let id: string | undefined
      try {
        const saved = z
          .object({ fingerprint: z.literal(fingerprint), id: versionSchema })
          .parse(JSON.parse(await readFile(marker, 'utf8')))
        await Version.parse(game, saved.id)
        id = saved.id
      } catch {
        /* An incomplete installation is retried, never marked ready. */
      }
      if (!id) {
        switch (config.loader.type) {
          case 'fabric':
            id = await installFabric({
              minecraft: game,
              minecraftVersion: config.minecraft,
              version: config.loader.version,
              signal: AbortSignal.timeout(60_000)
            })
            break
          case 'forge':
            id = await this.run(
              () =>
                installForgeTask({ mcversion: config.minecraft, version: loader.version }, game, {
                  ...this.libraryOptions(game),
                  java,
                  side: 'client'
                }),
              'loader',
              report,
              game
            )
            break
          case 'neoforge':
            id = await this.run(
              () =>
                installNeoForgedTask('neoforge', loader.version, game, {
                  ...this.libraryOptions(game),
                  java,
                  side: 'client'
                }),
              'loader',
              report,
              game
            )
            break
        }
      }
      versionSchema.parse(id)
      const version = await Version.parse(game, id)
      await this.run(
        () => installDependenciesTask(version, this.libraryOptions(game)),
        'loader',
        report,
        game
      )
      await writeFile(marker + '.tmp', JSON.stringify({ fingerprint, id }))
      await rename(marker + '.tmp', marker)
      return id
    } catch (error) {
      throw new LauncherError(
        'LOADER_INSTALL_FAILED',
        'Nie udało się zainstalować loadera. Sprawdź zgodność wersji Minecraft, Javy i loadera.',
        error
      )
    }
  }
}
