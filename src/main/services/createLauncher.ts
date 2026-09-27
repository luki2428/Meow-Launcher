import { app, safeStorage } from 'electron'
import Store from 'electron-store'
import { LauncherService } from './LauncherService'
import { SettingsService } from './SettingsService'
import { AccountStore } from '../auth/AccountStore'
import { MicrosoftAuthService } from '../auth/MicrosoftAuthService'
import { AuthService } from '../auth/AuthService'
import { InstanceService } from '../minecraft/InstanceService'
import { JavaService } from '../java/JavaService'
import { JavaRuntimeInstaller } from '../java/JavaRuntimeInstaller'
import { MinecraftInstallerService } from '../minecraft/MinecraftInstallerService'
import { GameProcessService } from '../minecraft/GameProcessService'
import { MinecraftLauncherAdapter } from '../minecraft/MinecraftLauncherAdapter'
import { MinecraftService } from '../minecraft/MinecraftService'
import { DeveloperPackService } from './DeveloperPackService'
import { ModpackService } from '../modpack/ModpackService'

export function createLauncher(): LauncherService {
  const directory = app.getPath('userData')
  const settings = new SettingsService(directory)
  const accounts = new AccountStore(
    settings,
    new Store<{ sessions: Record<string, string> }>({
      cwd: directory,
      name: 'sessions',
      defaults: { sessions: {} }
    }),
    safeStorage
  )
  const auth = new AuthService(
    accounts,
    new MicrosoftAuthService(
      accounts,
      process.env.MICROSOFT_CLIENT_ID || import.meta.env.MAIN_VITE_MICROSOFT_CLIENT_ID || ''
    )
  )
  const developer = new DeveloperPackService(settings)
  const instances = new InstanceService(
    () => settings.getSettings().installationDirectory,
    developer
  )
  const java = new JavaService(instances, new JavaRuntimeInstaller())
  const processes = new GameProcessService()
  const modpack = new ModpackService(instances)
  const minecraft = new MinecraftService(
    instances,
    auth,
    java,
    new MinecraftInstallerService(),
    new MinecraftLauncherAdapter(processes, () => settings.getSettings()),
    processes,
    modpack
  )
  return new LauncherService(app.getVersion(), settings, auth, minecraft, developer, modpack)
}
