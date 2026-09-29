import type { LauncherAccount, Result } from './types'

export type GameState =
  | 'idle'
  | 'preparing'
  | 'installing-java'
  | 'installing-minecraft'
  | 'installing-loader'
  | 'updating-modpack'
  | 'launching'
  | 'running'
  | 'stopped'
  | 'error'
export interface LauncherProgress {
  stage:
    | 'auth'
    | 'java'
    | 'minecraft'
    | 'loader'
    | 'checking'
    | 'downloading'
    | 'verifying'
    | 'installing'
    | 'launching'
    | 'running'
  progress?: number
  message: string
  currentFile?: string
  bytesPerSecond?: number
}
export interface GameSnapshot {
  state: GameState
  progress?: LauncherProgress
  pid?: number
  exitCode?: number | null
  error?: { code: string; message: string }
}
export interface LaunchOptions {
  accountId: string
  instanceId: string
  minMemoryMb: number
  maxMemoryMb: number
  serverAddress?: string
}
export interface AuthAPI {
  getSkin(accountId: string): Promise<Result<string | null>>
  loginMicrosoft(): Promise<Result<LauncherAccount>>
  loginOffline(username: string): Promise<Result<LauncherAccount>>
  logout(accountId: string): Promise<Result<void>>
  getAccounts(): Promise<Result<LauncherAccount[]>>
  getSelectedAccount(): Promise<Result<LauncherAccount | null>>
  selectAccount(accountId: string): Promise<Result<void>>
}
export interface MinecraftAPI {
  launch(options: LaunchOptions): Promise<Result<void>>
  getState(): Promise<Result<GameSnapshot>>
  cancelModpackUpdate(): Promise<Result<void>>
  onProgress(callback: (snapshot: GameSnapshot) => void): () => void
}
