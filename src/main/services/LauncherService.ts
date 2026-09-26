import type { LauncherSnapshot } from '../../shared/types'
import type { SettingsService } from './SettingsService'
import type { AuthService } from '../auth/AuthService'
import type { MinecraftService } from '../minecraft/MinecraftService'
import type { DeveloperPackService } from './DeveloperPackService'

export class LauncherService {
  constructor(
    private readonly version: string,
    readonly settings: SettingsService,
    readonly auth: AuthService,
    readonly minecraft: MinecraftService,
    readonly developer: DeveloperPackService
  ) {}

  getSnapshot(): LauncherSnapshot {
    return {
      version: this.version,
      settings: this.settings.getSettings(),
      memory: this.settings.memory,
      settingsWarning: this.settings.warning,
      server: { status: 'unknown', message: 'Status serwera nie został jeszcze sprawdzony.' },
      edition: {
        status: 'coming-soon',
        name: this.developer.enabled ? 'Lokalna paczka testowa' : 'Instancja główna',
        playEnabled: true,
        message: this.developer.enabled
          ? 'Tryb deweloperski: lokalny manifest, osobny folder gry. Kliknij GRAJ, aby przygotować Minecrafta.'
          : 'Java i pliki gry zostaną przygotowane automatycznie. Wybierz konto i kliknij GRAJ.'
      },
      modpackVersion: this.developer.enabled ? 'local-dev' : null,
      account:
        this.settings
          .getSettings()
          .accounts.find(
            (account) => account.uuid === this.settings.getSettings().selectedAccount
          ) ?? null
    }
  }
}
