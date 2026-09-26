// Explicit opt-in integration test: downloads Java/Minecraft into .smoke only.
import { resolve, join } from 'node:path'
import { stat } from 'node:fs/promises'
import { InstanceService } from '../src/main/minecraft/InstanceService'
import { JavaService } from '../src/main/java/JavaService'
import { JavaRuntimeInstaller } from '../src/main/java/JavaRuntimeInstaller'
import { MinecraftInstallerService } from '../src/main/minecraft/MinecraftInstallerService'
import { generateArguments, LaunchPrecheck, MinecraftFolder, Version } from '@xmcl/core'
import { getFabricLoaders } from '@xmcl/installer'
import type { LauncherProgress } from '../src/shared/game'
import { safeError } from '../src/main/shared/LauncherError'
import log from 'electron-log/main'
import type { InstanceConfig } from '../src/main/shared/validation'
import { fetchJson, trustedFetch } from '../src/main/shared/network'
import { z } from 'zod'

async function main(): Promise<void> {
  log.transports.file.level = false
  const directory = resolve('.smoke')
  const instances = new InstanceService(directory)
  const config = await instances.load('main')
  const javaService = new JavaService(instances, new JavaRuntimeInstaller())
  let last = 0
  const report = (progress: LauncherProgress): void => {
    if (Date.now() - last > 5000) {
      console.log(progress.message, progress.progress ?? '', progress.currentFile ?? '')
      last = Date.now()
    }
  }
  // A deliberately empty PATH and JAVA_HOME prove that no system Java is used.
  process.env.PATH = ''
  delete process.env.JAVA_HOME
  const java = await javaService.ensureRuntime(config, report)
  const before = (await stat(java)).mtimeMs
  await javaService.ensureRuntime(config, report)
  if ((await stat(java)).mtimeMs !== before) throw new Error('Runtime reinstalled unnecessarily')
  console.log(
    'Managed Java verified; reused with empty PATH:',
    await javaService.getRuntimeVersion('main')
  )
  const installer = new MinecraftInstallerService()
  const game = instances.game('main')
  await installer.ensureMinecraftInstalled(config, game, java, report)
  const clientJar = join(game, 'versions', config.minecraft, config.minecraft + '.jar')
  const clientBefore = (await stat(clientJar)).mtimeMs
  await installer.ensureMinecraftInstalled(config, game, java, report)
  if ((await stat(clientJar)).mtimeMs !== clientBefore)
    throw new Error('Client downloaded unnecessarily')
  const loaders = await getFabricLoaders({ signal: AbortSignal.timeout(30_000) })
  const fabric = loaders.find((loader) => loader.stable)
  if (!fabric) throw new Error('No stable Fabric loader')
  const loaderConfig: InstanceConfig = {
    ...config,
    loader: { type: 'fabric', version: fabric.version }
  }
  if (process.argv.includes('--neoforge')) {
    const response = await trustedFetch(
      'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml',
      ['maven.neoforged.net'],
      AbortSignal.timeout(30_000)
    )
    const matches = [...(await response.text()).matchAll(/<version>(21\.1\.\d+)<\/version>/g)]
    const version = matches.at(-1)?.[1]
    if (!version) throw new Error('No matching NeoForge release')
    loaderConfig.loader = { type: 'neoforge', version }
  }
  if (process.argv.includes('--forge')) {
    const promotions = z
      .object({ promos: z.record(z.string(), z.string()) })
      .parse(
        await fetchJson(
          'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json',
          ['files.minecraftforge.net']
        )
      )
    const version =
      promotions.promos[config.minecraft + '-recommended'] ??
      promotions.promos[config.minecraft + '-latest']
    if (!version) throw new Error('No Forge for configured Minecraft')
    loaderConfig.loader = { type: 'forge', version }
  }
  const version = await installer.ensureLoaderInstalled(loaderConfig, game, java, report)
  const repeated = await installer.ensureLoaderInstalled(loaderConfig, game, java, report)
  if (version !== repeated) throw new Error('Loader cache mismatch')
  const resolved = await Version.parse(game, version)
  const options = {
    gamePath: game,
    javaPath: java,
    version: resolved,
    gameProfile: { name: 'SmokeTest', id: '00000000000000000000000000000001' },
    accessToken: '0',
    minMemory: 512,
    maxMemory: 1024
  }
  for (const check of LaunchPrecheck.DEFAULT_PRECHECKS)
    await check(new MinecraftFolder(game), resolved, options)
  const args = await generateArguments(options)
  if (!args.includes(resolved.mainClass)) throw new Error('Missing main class')
  console.log(
    `PASS: Java without PATH, first/repeat Minecraft install, ${loaderConfig.loader.type} first/repeat install, natives, launch arguments.`
  )
}
void main().catch((error) => {
  console.error(safeError(error))
  // Installer-only test; no credentials are present in this process.
  if (error instanceof Error) console.error(error.cause)
  process.exitCode = 1
})
