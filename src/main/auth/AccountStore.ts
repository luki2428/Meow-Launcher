import type { LauncherAccount, Result } from '../../shared/types'
import type { SettingsService } from '../services/SettingsService'
import { LauncherError } from '../shared/LauncherError'

export function unwrap<T>(value: Result<T>): T {
  if (!value.ok) throw new LauncherError(value.error.code, value.error.message)
  return value.data
}
export class AccountStore {
  constructor(
    readonly settings: SettingsService,
    private readonly secrets: {
      get(key: 'sessions'): Record<string, string>
      set(key: 'sessions', value: Record<string, string>): void
    },
    private readonly encryption: {
      isEncryptionAvailable(): boolean
      getSelectedStorageBackend(): string
      encryptString(value: string): Buffer
      decryptString(value: Buffer): string
    }
  ) {}
  getAccounts(): LauncherAccount[] {
    return this.settings.getSettings().accounts
  }
  getSelectedAccount(): LauncherAccount | null {
    return (
      this.getAccounts().find((a) => a.id === this.settings.getSettings().selectedAccount) ?? null
    )
  }
  selectAccount(id: string): void {
    unwrap(this.settings.selectAccount(id))
  }
  addAccount(account: LauncherAccount): void {
    unwrap(this.settings.addAccount(account))
  }
  saveMicrosoftAccount(account: LauncherAccount, session: string): void {
    const previous = { ...this.secrets.get('sessions') }
    this.writeSession(account.id, session)
    try {
      this.addAccount(account)
    } catch (error) {
      this.secrets.set('sessions', previous)
      throw error
    }
  }
  removeAccount(id: string): void {
    // Remove credentials first: even if metadata write fails the session is revoked locally.
    const sessions = { ...this.secrets.get('sessions') }
    delete sessions[id]
    this.secrets.set('sessions', sessions)
    unwrap(this.settings.removeAccount(id))
  }
  assertEncryption(): void {
    if (
      !this.encryption.isEncryptionAvailable() ||
      (process.platform === 'linux' && this.encryption.getSelectedStorageBackend() === 'basic_text')
    ) {
      throw new LauncherError(
        'SECURE_STORAGE_UNAVAILABLE',
        'Systemowe szyfrowanie sesji jest niedostępne. Logowanie Microsoft jest zablokowane.'
      )
    }
  }
  readSession(id: string): string {
    this.assertEncryption()
    try {
      const blob = this.secrets.get('sessions')[id]
      if (!blob) throw new Error('Missing session')
      return this.encryption.decryptString(Buffer.from(blob, 'base64'))
    } catch {
      throw new LauncherError(
        'MICROSOFT_SESSION_EXPIRED',
        'Nie można odtworzyć sesji. Zaloguj się ponownie.'
      )
    }
  }
  writeSession(id: string, session: string): void {
    this.assertEncryption()
    const blob = this.encryption.encryptString(session).toString('base64')
    this.secrets.set('sessions', { ...this.secrets.get('sessions'), [id]: blob })
  }
}
