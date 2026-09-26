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

export class MinecraftService {
  readonly events = new EventEmitter()
  private snapshot: GameSnapshot = { state: 'idle' }
  private preparing = false
  constructor(
    private readonly instances: InstanceService,
    private readonly auth: Pick<AuthService, 'getValidMinecraftSession'>,
    private readonly java: Pick<JavaService, 'ensureRuntime'>,
    private readonly installer: Pick<
      MinecraftInstallerService,
      'ensureMinecraftInstalled' | 'ensureLoaderInstalled'
    >,
    private readonly adapter: Pick<MinecraftLauncherAdapter, 'launch'>,
    private readonly processes: Pick<GameProcessService, 'running'>
  ) {}
  getState(): GameSnapshot {
    return structuredClone(this.snapshot)
  }
  private update = (state: GameSnapshot): void => {
    this.snapshot = state
    this.events.emit('state', this.getState())
  }
  private report = (progress: LauncherProgress): void => {
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
    try {
      this.stage('preparing', 'checking', 'Sprawdzanie instancji…')
      const config = await this.instances.load(options.instanceId)
      if (!config.playEnabled)
        throw new LauncherError(
          'PLAY_DISABLED',
          'Uruchamianie tej instancji jest obecnie wyłączone.'
        )
      this.stage('preparing', 'auth', 'Sprawdzanie sesji konta…')
      await this.auth.getValidMinecraftSession(options.accountId)
      this.stage('installing-java', 'java', 'Sprawdzanie Java Runtime…')
      const java = await this.java.ensureRuntime(config, this.report)
      const game = this.instances.game(config.id)
      this.stage('installing-minecraft', 'minecraft', `Sprawdzanie Minecraft ${config.minecraft}…`)
      await this.installer.ensureMinecraftInstalled(config, game, java, this.report)
      this.stage('installing-loader', 'loader', 'Sprawdzanie loadera…')
      const version = await this.installer.ensureLoaderInstalled(config, game, java, this.report)
      // Installation can outlive a token or the user can log out while it is running.
      const session = await this.auth.getValidMinecraftSession(options.accountId)
      this.stage('launching', 'launching', 'Uruchamianie Minecraft…')
      log.info('Minecraft: launch')
      await this.adapter.launch(options, session, java, game, version, this.update)
    } catch (error) {
      const safe = safeError(error)
      log.error('Minecraft: operation failed', safe.code)
      this.update({ state: 'error', error: safe })
      throw new LauncherError(safe.code, safe.message)
    } finally {
      this.preparing = false
    }
  }
}
