import { createHash } from 'node:crypto'
import type { OfflineAccount } from '../../shared/types'
import { LauncherError } from '../shared/LauncherError'

export function isValidUsername(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_]{3,16}$/.test(value)
}

export function createOfflineAccount(username: string): OfflineAccount {
  if (!isValidUsername(username))
    throw new LauncherError(
      'INVALID_OFFLINE_USERNAME',
      'Nick musi mieć 3–16 znaków: litery, cyfry lub podkreślenie.'
    )
  const hash = createHash('md5').update(`OfflinePlayer:${username}`, 'utf8').digest()
  hash[6] = (hash[6] & 0x0f) | 0x30
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.toString('hex')
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  return { id: uuid, type: 'offline', username, uuid }
}
