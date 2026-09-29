import { CommunityService } from './CommunityService'
import { ServerStatusService } from './ServerStatusService'
import type { LauncherSnapshot } from '../../shared/types'
import type { SettingsService } from './SettingsService'
import type { AuthService } from '../auth/AuthService'
import type { MinecraftService } from '../minecraft/MinecraftService'
import type { DeveloperPackService } from './DeveloperPackService'
import type { ModpackService } from '../modpack/ModpackService'

export class LauncherService {
  private readonly serverStatus = new ServerStatusService()
  community?: CommunityService
  updater?: import('./UpdateService').UpdateService
  constructor(
    private readonly version: string,
    readonly settings: SettingsService,
    readonly auth: AuthService,
    readonly minecraft: MinecraftService,
    readonly developer: DeveloperPackService,
    private readonly modpack: ModpackService
  ) {}

  async getSnapshot(): Promise<LauncherSnapshot> {
    const modpackVersion = this.developer.enabled
      ? 'local-dev'
      : await this.modpack.installedVersion()
    const remote = await this.community?.get()
    const server = await this.serverStatus.get(remote?.config.server ?? null)
    return {
      community: remote?.content,
      version: this.version,
      settings: this.settings.getSettings(),
      memory: this.settings.memory,
      settingsWarning: this.settings.warning,
      server,
      edition: {
        status: 'coming-soon',
        name: this.developer.enabled ? 'Lokalna paczka testowa' : 'Instancja główna',
        playEnabled: true,
        message: this.developer.enabled
          ? 'Tryb deweloperski: lokalny manifest, osobny folder gry. Kliknij GRAJ, aby przygotować Minecrafta.'
          : 'Java i pliki gry zostaną przygotowane automatycznie. Wybierz konto i kliknij GRAJ.'
      },
      modpackVersion,
      account:
        this.settings
          .getSettings()
          .accounts.find(
            (account) => account.uuid === this.settings.getSettings().selectedAccount
          ) ?? null
    }
  }
}
