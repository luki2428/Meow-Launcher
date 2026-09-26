import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  statSync
} from 'node:fs'
import { join } from 'node:path'
import { totalmem } from 'node:os'
import type { LauncherAccount, LauncherSettings, Result } from '../../shared/types'
import { accountSchema } from '../shared/validation'
import { createOfflineAccount, isValidUsername } from './OfflineAccount'
import { preferencesSchema } from './GamePreferences'

export class SettingsService {
  readonly memory = {
    min: 1024,
    max: Math.max(1024, Math.floor((totalmem() / 1024 ** 2 - 2048) / 512) * 512),
    step: 512
  }
  private settings: LauncherSettings
  private readonly path: string
  warning: string | null = null

  constructor(private readonly directory: string) {
    this.path = join(directory, 'settings.json')
    this.settings = {
      ram: Math.min(4096, this.memory.max),
      accounts: [],
      selectedAccount: null,
      installationDirectory: directory,
      windowWidth: 1280,
      windowHeight: 720,
      fullscreen: false,
      developerMode: false
    }
    if (!existsSync(this.path)) return

    try {
      const data: unknown = JSON.parse(readFileSync(this.path, 'utf8'))
      if (!data || typeof data !== 'object' || !('ram' in data) || !this.isValidRam(data.ram)) {
        throw new Error('Invalid settings')
      }
      const accounts: LauncherSettings['accounts'] = []
      if ('accounts' in data) {
        if (!Array.isArray(data.accounts)) throw new Error('Invalid accounts')
        for (const item of data.accounts) {
          if (item?.type === 'microsoft') {
            const parsed = accountSchema.parse(item)
            if (parsed.id !== parsed.uuid || accounts.some((a) => a.id === parsed.id))
              throw new Error('Invalid account')
            accounts.push({ ...parsed, type: 'microsoft' })
            continue
          }
          if (
            !item ||
            typeof item !== 'object' ||
            item.type !== 'offline' ||
            !isValidUsername(item.username)
          )
            throw new Error('Invalid account')
          const account = createOfflineAccount(item.username)
          if (
            account.uuid !== item.uuid ||
            accounts.some(
              (saved) => saved.username.toLowerCase() === account.username.toLowerCase()
            )
          )
            throw new Error('Invalid account')
          accounts.push(account)
        }
      }
      const selectedAccount = 'selectedAccount' in data ? data.selectedAccount : null
      if (
        selectedAccount !== null &&
        (typeof selectedAccount !== 'string' ||
          !accounts.some((account) => account.uuid === selectedAccount))
      )
        throw new Error('Invalid selection')
      const preferences = preferencesSchema.parse({
        ram: data.ram,
        installationDirectory:
          'installationDirectory' in data ? data.installationDirectory : directory,
        windowWidth: 'windowWidth' in data ? data.windowWidth : 1280,
        windowHeight: 'windowHeight' in data ? data.windowHeight : 720,
        fullscreen: 'fullscreen' in data ? data.fullscreen : false
      })
      const developerMode = 'developerMode' in data ? data.developerMode : false
      if (typeof developerMode !== 'boolean') throw new Error('Invalid developer mode')
      this.settings = { ...preferences, accounts, selectedAccount, developerMode }
    } catch {
      this.warning =
        'Nie udało się odczytać ustawień. Użyto wartości domyślnych. Zapis zastąpi plik ustawień.'
    }
  }

  getSettings(): LauncherSettings {
    return { ...this.settings, accounts: this.settings.accounts.map((account) => ({ ...account })) }
  }

  private isValidRam(ram: unknown): ram is number {
    return (
      typeof ram === 'number' &&
      Number.isInteger(ram) &&
      ram >= this.memory.min &&
      ram <= this.memory.max &&
      ram % this.memory.step === 0
    )
  }

  setRam(ram: unknown): Result<LauncherSettings> {
    if (!this.isValidRam(ram)) {
      return {
        ok: false,
        error: { code: 'INVALID_RAM', message: 'Wybrana ilość RAM jest nieprawidłowa.' }
      }
    }
    return this.save({ ...this.settings, ram })
  }

  setDeveloperMode(enabled: boolean): Result<LauncherSettings> {
    return this.save({ ...this.settings, developerMode: enabled })
  }

  savePreferences(input: unknown): Result<LauncherSettings> {
    const parsed = preferencesSchema.safeParse(input)
    if (!parsed.success || !this.isValidRam(parsed.data.ram))
      return {
        ok: false,
        error: {
          code: 'INVALID_SETTINGS',
          message: 'Sprawdź RAM, folder i rozmiar okna (854–7680 × 480–4320).'
        }
      }
    if (parsed.data.installationDirectory !== this.settings.installationDirectory) {
      try {
        if (!statSync(parsed.data.installationDirectory).isDirectory())
          throw new Error('Not a directory')
        accessSync(parsed.data.installationDirectory, constants.R_OK | constants.W_OK)
      } catch {
        return {
          ok: false,
          error: {
            code: 'INVALID_DIRECTORY',
            message: 'Folder jest niedostępny lub nie masz uprawnień do zapisu.'
          }
        }
      }
    }
    return this.save({ ...this.settings, ...parsed.data })
  }

  saveOfflineAccount(username: unknown, previousUuid: unknown): Result<LauncherSettings> {
    if (!isValidUsername(username))
      return this.invalid('Nick musi mieć 3–16 znaków: litery A–Z, cyfry lub podkreślenie.')
    if (
      previousUuid !== undefined &&
      !this.settings.accounts.some(
        (account) => account.uuid === previousUuid && account.type === 'offline'
      )
    )
      return this.invalid('Nie znaleziono konta do edycji.')
    if (
      this.settings.accounts.some(
        (account) =>
          account.uuid !== previousUuid && account.username.toLowerCase() === username.toLowerCase()
      )
    )
      return this.invalid('Konto o takim nicku już istnieje.')
    const account = createOfflineAccount(username)
    const accounts =
      previousUuid === undefined
        ? [...this.settings.accounts, account]
        : this.settings.accounts.map((saved) => (saved.uuid === previousUuid ? account : saved))
    return this.save({ ...this.settings, accounts, selectedAccount: account.uuid })
  }

  selectAccount(uuid: unknown): Result<LauncherSettings> {
    if (
      uuid !== null &&
      (typeof uuid !== 'string' || !this.settings.accounts.some((account) => account.uuid === uuid))
    )
      return this.invalid('Nie znaleziono wybranego konta.')
    return this.save({ ...this.settings, selectedAccount: uuid })
  }

  addAccount(account: LauncherAccount): Result<LauncherSettings> {
    const parsed = accountSchema.parse(account)
    const metadata: LauncherAccount =
      parsed.type === 'microsoft'
        ? { ...parsed, type: 'microsoft' }
        : { ...parsed, type: 'offline' }
    if (metadata.id !== metadata.uuid) return this.invalid('Nieprawidłowy identyfikator konta.')
    return this.save({
      ...this.settings,
      accounts: [...this.settings.accounts.filter((a) => a.id !== metadata.id), metadata],
      selectedAccount: metadata.id
    })
  }

  removeAccount(uuid: unknown): Result<LauncherSettings> {
    if (
      typeof uuid !== 'string' ||
      !this.settings.accounts.some((account) => account.uuid === uuid)
    )
      return this.invalid('Nie znaleziono konta.')
    return this.save({
      ...this.settings,
      accounts: this.settings.accounts.filter((account) => account.uuid !== uuid),
      selectedAccount: this.settings.selectedAccount === uuid ? null : this.settings.selectedAccount
    })
  }

  private invalid(message: string): Result<LauncherSettings> {
    return { ok: false, error: { code: 'INVALID_ACCOUNT', message } }
  }

  private save(settings: LauncherSettings): Result<LauncherSettings> {
    try {
      mkdirSync(this.directory, { recursive: true })
      writeFileSync(this.path + '.tmp', JSON.stringify(settings, null, 2), 'utf8')
      renameSync(this.path + '.tmp', this.path)
      this.settings = settings
      this.warning = null
      return { ok: true, data: this.getSettings() }
    } catch {
      return {
        ok: false,
        error: {
          code: 'SETTINGS_SAVE_FAILED',
          message: 'Nie udało się zapisać ustawień. Sprawdź uprawnienia i miejsce na dysku.'
        }
      }
    }
  }
}
