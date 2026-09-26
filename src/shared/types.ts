// Publiczne dane IPC. Nigdy nie dodawaj tutaj tokenów ani API systemowych.
export interface LauncherSettings {
  ram: number
  installationDirectory: string
  windowWidth: number
  windowHeight: number
  fullscreen: boolean
  developerMode: boolean
  accounts: LauncherAccount[]
  selectedAccount: string | null
}

export type GamePreferences = Pick<
  LauncherSettings,
  'ram' | 'installationDirectory' | 'windowWidth' | 'windowHeight' | 'fullscreen'
>

export interface OfflineAccount {
  id: string
  type: 'offline'
  username: string
  uuid: string
}
export interface MicrosoftAccount {
  id: string
  type: 'microsoft'
  username: string
  uuid: string
}
export type LauncherAccount = OfflineAccount | MicrosoftAccount

export interface LauncherSnapshot {
  version: string
  settings: LauncherSettings
  memory: { min: number; max: number; step: number }
  settingsWarning: string | null
  server: { status: 'unknown'; message: string }
  edition: { status: 'coming-soon' | 'active'; name: string; playEnabled: boolean; message: string }
  modpackVersion: string | null
  account: LauncherAccount | null
}

export type Result<T> =
  { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

export interface LauncherAPI {
  auth: import('./game').AuthAPI
  minecraft: import('./game').MinecraftAPI
  getSnapshot(): Promise<LauncherSnapshot>
  setRam(ram: number): Promise<Result<LauncherSettings>>
  savePreferences(preferences: GamePreferences): Promise<Result<LauncherSettings>>
  chooseInstallationDirectory(): Promise<Result<string | null>>
  openGameDirectory(): Promise<Result<void>>
  getDeveloperPack(): Promise<Result<import('./developer').DeveloperPackInfo>>
  generateDeveloperPack(
    options: import('./developer').DeveloperPackOptions
  ): Promise<Result<LauncherSettings>>
  setDeveloperMode(enabled: boolean): Promise<Result<LauncherSettings>>
  openDeveloperPackDirectory(): Promise<Result<void>>
  saveOfflineAccount(username: string, previousUuid?: string): Promise<Result<LauncherSettings>>
  selectAccount(uuid: string | null): Promise<Result<LauncherSettings>>
  removeAccount(uuid: string): Promise<Result<LauncherSettings>>
}
