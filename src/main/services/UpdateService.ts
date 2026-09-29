import type { AppUpdater } from 'electron-updater'
import log from 'electron-log/main'
import type { UpdateState } from '../../shared/update'

export type Updater = Pick<
  AppUpdater,
  | 'on'
  | 'checkForUpdates'
  | 'quitAndInstall'
  | 'autoDownload'
  | 'autoInstallOnAppQuit'
  | 'allowPrerelease'
  | 'allowDowngrade'
  | 'logger'
>

export class UpdateService {
  private started = false
  private state: UpdateState = {
    stage: 'disabled',
    message: 'Aktualizacje wyłączone w trybie deweloperskim.'
  }

  constructor(
    private readonly updater: Updater,
    private readonly active: () => boolean
  ) {}

  getState(): UpdateState {
    return { ...this.state }
  }

  async start(packaged: boolean): Promise<void> {
    if (!packaged || this.started) return
    this.started = true
    this.updater.autoDownload = true
    this.updater.autoInstallOnAppQuit = false
    this.updater.allowPrerelease = false
    this.updater.allowDowngrade = false
    // Raw upstream errors can include request URLs/headers. Log only controlled messages.
    this.updater.logger = null
    this.updater.on('error', () => this.fail())
    this.updater.on('update-not-available', () => {
      this.state = { stage: 'current', message: 'Launcher jest aktualny.' }
      log.info('Launcher update: current')
    })
    this.updater.on('update-available', () => {
      this.state = { stage: 'downloading', message: 'Pobieranie aktualizacji launchera…' }
      log.info('Launcher update: downloading')
    })
    this.updater.on('download-progress', (progress) => {
      const percent = Number.isFinite(progress.percent)
        ? Math.max(0, Math.min(100, Math.round(progress.percent)))
        : 0
      this.state = {
        stage: 'downloading',
        message: `Aktualizacja launchera: ${percent}%`,
        progress: percent
      }
    })
    this.updater.on('update-downloaded', () => {
      this.state = {
        stage: 'ready',
        message: 'Aktualizacja pobrana. Restart launchera po zamknięciu Minecrafta.'
      }
      log.info('Launcher update: verified and ready')
      this.installIfIdle()
    })
    this.state = { stage: 'checking', message: 'Sprawdzanie aktualizacji launchera…' }
    log.info('Launcher update: checking')
    try {
      const result = await this.updater.checkForUpdates()
      await result?.downloadPromise
    } catch {
      this.fail()
    }
  }

  installIfIdle(): void {
    if (this.state.stage !== 'ready' || this.active()) return
    this.state = {
      stage: 'installing',
      message: 'Instalowanie aktualizacji. Launcher uruchomi się ponownie…'
    }
    log.info('Launcher update: installing')
    try {
      this.updater.quitAndInstall(false, true)
    } catch {
      this.fail()
    }
  }

  private fail(): void {
    this.state = {
      stage: 'error',
      message: 'Nie udało się zaktualizować launchera. Spróbujemy przy następnym uruchomieniu.'
    }
    log.warn('Launcher update: failed; continuing with installed version')
  }
}
