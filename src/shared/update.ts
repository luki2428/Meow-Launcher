export interface UpdateState {
  stage: 'disabled' | 'checking' | 'current' | 'downloading' | 'ready' | 'installing' | 'error'
  message: string
  progress?: number
}
