export interface DeveloperPackOptions {
  loader: 'vanilla' | 'neoforge'
  loaderVersion: string
}

export const DEFAULT_DEVELOPER_PACK: DeveloperPackOptions = {
  loader: 'neoforge',
  loaderVersion: '21.1.172'
}

export interface DeveloperPackInfo {
  manifestPath: string
  gameDirectory: string
  exists: boolean
  description: string | null
  error: string | null
}
