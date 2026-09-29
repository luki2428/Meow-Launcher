export interface ServerStatus {
  status: 'unknown' | 'online' | 'offline'
  message: string
  players?: number
  maxPlayers?: number
  ping?: number
  version?: string
}
export interface CommunityEntry {
  id: string
  date: string
  title: string
  body: string
}
export interface CommunityContent {
  news: CommunityEntry[]
  changelog: CommunityEntry[]
  warning: string | null
}
