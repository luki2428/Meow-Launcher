import pLimit from 'p-limit'
import type { LauncherAccount } from '../../shared/types'
import { createOfflineAccount } from '../services/OfflineAccount'
import { LauncherError } from '../shared/LauncherError'
import type { AccountStore } from './AccountStore'
import type { MicrosoftAuthService } from './MicrosoftAuthService'

export interface GameSession {
  account: LauncherAccount
  accessToken: string
}
export class AuthService {
  private readonly serial = pLimit(1)
  constructor(
    readonly accounts: AccountStore,
    private readonly microsoft: Pick<MicrosoftAuthService, 'login' | 'refresh'>
  ) {}
  loginMicrosoft(): Promise<LauncherAccount> {
    return this.serial(() => this.microsoft.login())
  }
  loginOffline(username: string): Promise<LauncherAccount> {
    return this.serial(() => {
      const account = createOfflineAccount(username)
      if (
        this.accounts.getAccounts().some((a) => a.username.toLowerCase() === username.toLowerCase())
      )
        throw new LauncherError('INVALID_ACCOUNT', 'Konto o takim nicku już istnieje.')
      this.accounts.addAccount(account)
      return account
    })
  }
  logout(id: string): Promise<void> {
    return this.serial(() => this.accounts.removeAccount(id))
  }
  getValidMinecraftSession(id: string): Promise<GameSession> {
    return this.serial(async () => {
      const account = this.accounts.getAccounts().find((a) => a.id === id)
      if (!account)
        throw new LauncherError('INVALID_ACCOUNT', 'Wybierz konto przed uruchomieniem gry.')
      return account.type === 'microsoft'
        ? this.microsoft.refresh(account)
        : { account, accessToken: '0' }
    })
  }
}
