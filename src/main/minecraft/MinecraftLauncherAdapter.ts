import { launch } from '@xmcl/core'
import { spawn } from 'node:child_process'
import type { LaunchOptions, GameSnapshot } from '../../shared/game'
import type { GameSession } from '../auth/AuthService'
import type { GameProcessService } from './GameProcessService'
import { LauncherError } from '../shared/LauncherError'
import type { GamePreferences } from '../../shared/types'

export class MinecraftLauncherAdapter {
  constructor(
    private readonly processes: GameProcessService,
    private readonly preferences?: () => GamePreferences
  ) {}
  async launch(
    options: LaunchOptions,
    session: GameSession,
    java: string,
    game: string,
    version: string,
    update: (state: GameSnapshot) => void
  ): Promise<void> {
    let spawned: Promise<void> = Promise.resolve()
    const preferences = this.preferences?.()
    await launch({
      gamePath: game,
      resourcePath: game,
      javaPath: java,
      version,
      gameProfile: { name: session.account.username, id: session.account.uuid.replaceAll('-', '') },
      accessToken: session.accessToken,
      userType: session.account.type === 'offline' ? 'legacy' : 'mojang',
      minMemory: options.minMemoryMb,
      maxMemory: options.maxMemoryMb,
      resolution: preferences
        ? {
            width: preferences.windowWidth,
            height: preferences.windowHeight,
            fullscreen: preferences.fullscreen
          }
        : undefined,
      quickPlayMultiplayer: options.serverAddress,
      launcherName: 'MeowLauncher',
      extraExecOption: { windowsHide: true, shell: false },
      spawn: (command, args, spawnOptions) => {
        const child = spawn(command, args ?? [], {
          ...spawnOptions,
          shell: false,
          windowsHide: true
        })
        this.processes.monitor(child, [session.accessToken], update)
        spawned = new Promise<void>((resolve, reject) => {
          child.once('spawn', resolve)
          child.once('error', () =>
            reject(
              new LauncherError(
                'MINECRAFT_LAUNCH_FAILED',
                'Nie udało się uruchomić procesu Minecraft.'
              )
            )
          )
        })
        void spawned.catch(() => {})
        return child
      }
    })
    await spawned
  }
}
