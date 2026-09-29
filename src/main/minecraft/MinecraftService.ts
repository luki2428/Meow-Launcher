import { EventEmitter } from 'node:events'
import { totalmem } from 'node:os'
import log from 'electron-log/main'
import type { GameSnapshot, GameState, LauncherProgress, LaunchOptions } from '../../shared/game'
import type { AuthService } from '../auth/AuthService'
import type { JavaService } from '../java/JavaService'
import type { InstanceService } from './InstanceService'
import type { MinecraftInstallerService } from './MinecraftInstallerService'
import type { MinecraftLauncherAdapter } from './MinecraftLauncherAdapter'
import type { GameProcessService } from './GameProcessService'
import { launchSchema } from '../shared/validation'
import { LauncherError, safeError } from '../shared/LauncherError'
import type { ModpackService } from '../modpack/ModpackService'

export class MinecraftService {
  readonly events = new EventEmitter()
  private snapshot: GameSnapshot = { state: 'idle' }
  private preparing = false
  private installationAbort?: AbortController
  constructor(
    private readonly instances: InstanceService,
    private readonly auth: Pick<AuthService, 'getValidMinecraftSession'>,
    private readonly java: Pick<JavaService, 'ensureRuntime'>,
    private readonly installer: Pick<
      MinecraftInstallerService,
      'ensureMinecraftInstalled' | 'ensureLoaderInstalled'
    >,
    private readonly adapter: Pick<MinecraftLauncherAdapter, 'launch'>,
    private readonly processes: Pick<GameProcessService, 'running'>,
    private readonly modpack?: Pick<ModpackService, 'check' | 'synchronize'>
  ) {}
  getState(): GameSnapshot {
    return structuredClone(this.snapshot)
  }
  cancelModpackUpdate(): void {
    this.cancelInstallation()
  }
  cancelInstallation(): void {
    if (!this.preparing || ['launching', 'running'].includes(this.snapshot.state)) return
    this.installationAbort?.abort()
    this.report({
      stage: this.snapshot.progress?.stage ?? 'checking',
      message: 'Anulowanie instalacji…'
    })
  }
  private update = (state: GameSnapshot): void => {
    this.snapshot = state
    this.events.emit('state', this.getState())
  }
  private report = (progress: LauncherProgress): void => {
    if (this.installationAbort?.signal.aborted) {
      progress = { stage: progress.stage, message: 'Anulowanie instalacji…' }
    }
    if (this.installationAbort?.signal.aborted) {
      progress = { stage: progress.stage, message: 'Anulowanie instalacji…' }
    }
    this.update({ ...this.snapshot, progress })
  }
  private stage(state: GameState, stage: LauncherProgress['stage'], message: string): void {
    this.update({ state, progress: { stage, message } })
  }
  async launch(input: LaunchOptions): Promise<void> {
    if (this.preparing || this.processes.running)
      throw new LauncherError(
        'GAME_ALREADY_RUNNING',
        'Gra jest już uruchomiona lub przygotowywana.'
      )
    const options = launchSchema.parse(input)
    if (
      options.maxMemoryMb > Math.max(1024, Math.floor((totalmem() / 1024 ** 2 - 2048) / 512) * 512)
    )
      throw new LauncherError('INVALID_RAM', 'Wybrana ilość RAM przekracza dostępny limit.')
    this.preparing = true
    this.installationAbort = new AbortController()
    const signal = this.installationAbort.signal
    try {
      this.stage('preparing', 'checking', 'Sprawdzanie instancji…')
      let config = await this.instances.load(options.instanceId)
      signal.throwIfAborted()
      signal.throwIfAborted()
      if (!config.playEnabled)
        throw new LauncherError(
          'PLAY_DISABLED',
          'Uruchamianie tej instancji jest obecnie wyłączone.'
        )
      this.stage('preparing', 'auth', 'Sprawdzanie sesji konta…')
      await this.auth.getValidMinecraftSession(options.accountId)
      signal.throwIfAborted()
      signal.throwIfAborted()
      if (config.modpack && this.modpack) {
        this.stage('updating-modpack', 'checking', 'Sprawdzanie aktualizacji paczki…')
        try {
          const manifest = await this.modpack.check(
            config,
            this.report,
            this.installationAbort.signal
          )
          if (manifest) {
            await this.modpack.synchronize(
              config,
              manifest,
              this.report,
              this.installationAbort.signal
            )
            config = {
              ...config,
              minecraft: manifest.minecraft,
              loader: manifest.loader,
              java: manifest.java ?? config.java
            }
          }
        } catch (error) {
          if (this.installationAbort.signal.aborted)
            throw new LauncherError('MODPACK_CANCELLED', 'Aktualizacja paczki została anulowana.')
          throw error
        }
      }
      signal.throwIfAborted()
      this.stage('installing-java', 'java', 'Sprawdzanie Java Runtime…')
      const java = await this.java.ensureRuntime(config, this.report, signal)
      const game = this.instances.game(config.id)
      signal.throwIfAborted()
      this.stage('installing-minecraft', 'minecraft', `Sprawdzanie Minecraft ${config.minecraft}…`)
      await this.installer.ensureMinecraftInstalled(config, game, java, this.report, signal)
      signal.throwIfAborted()
      this.stage('installing-loader', 'loader', 'Sprawdzanie loadera…')
      const version = await this.installer.ensureLoaderInstalled(
        config,
        game,
        java,
        this.report,
        signal
      )
      signal.throwIfAborted()
      signal.throwIfAborted()
      const session = await this.auth.getValidMinecraftSession(options.accountId)
      signal.throwIfAborted()
      this.stage('launching', 'launching', 'Uruchamianie Minecraft…')
      log.info('Minecraft: launch')
      await this.adapter.launch(options, session, java, game, version, this.update)
    } catch (error) {
      if (signal.aborted) {
        log.info('Minecraft: installation cancelled')
        this.update({
          state: 'idle',
          progress: { stage: 'checking', message: 'Instalacja anulowana.' }
        })
        return
      }
      const safe = safeError(error)
      log.error('Minecraft: operation failed', safe.code)
      this.update({ state: 'error', error: safe })
      throw new LauncherError(safe.code, safe.message)
    } finally {
      this.preparing = false
      this.installationAbort = undefined
    }
  }
}
