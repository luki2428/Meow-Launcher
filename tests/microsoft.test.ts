import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { InteractionRequiredAuthError, ServerError } from '@azure/msal-node'
import { MicrosoftMinecraftXboxLoginError } from '@xmcl/user'
import { classifyMicrosoftError, MicrosoftStageError } from '../src/main/auth/microsoftErrors'
import { MicrosoftAuthService, type OAuthClient } from '../src/main/auth/MicrosoftAuthService'
import { AccountStore } from '../src/main/auth/AccountStore'
import { SettingsService } from '../src/main/services/SettingsService'
import { createOfflineAccount } from '../src/main/services/OfflineAccount'
import log from 'electron-log/main'

log.transports.file.level = false
log.transports.console.level = false
test('Microsoft errors map to user messages with token-free diagnostics', () => {
  const appRegistration = classifyMicrosoftError(
    new MicrosoftStageError(
      'minecraft',
      new MicrosoftMinecraftXboxLoginError(
        403,
        '{"errorMessage":"Invalid app registration, see https://aka.ms/AppRegInfo"}'
      )
    )
  )
  assert.equal(appRegistration.error.code, 'MICROSOFT_APP_NOT_APPROVED')
  assert.equal(
    appRegistration.diagnostic,
    'minecraft: MicrosoftMinecraftXboxLoginError, status 403, invalid app registration'
  )
  const noXbox = classifyMicrosoftError(
    new MicrosoftStageError(
      'xbox',
      Object.assign(new Error('status code: 401: secret-body'), { XErr: 2148916233 })
    )
  )
  assert.equal(noXbox.error.code, 'MICROSOFT_NO_XBOX_ACCOUNT')
  assert.ok(!noXbox.diagnostic.includes('secret-body'))
  const client = classifyMicrosoftError(
    new ServerError('invalid_client', 'correlation', 'AADSTS7000218: secret detail', '', '7000218')
  )
  assert.equal(client.error.code, 'MICROSOFT_APP_MISCONFIGURED')
  assert.equal(client.diagnostic, 'oauth: ServerError, invalid_client, AADSTS7000218')
})
test('Microsoft service persists OAuth cache, restores after restart, rotates cache and expires safely', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'meow-ms-test-'))
  t.after(() => {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep))
    rmSync(directory, { recursive: true, force: true })
  })
  let blobs: Record<string, string> = {}
  const vault = new Map<string, string>()
  const persistence = {
    get: () => blobs,
    set: (_key: 'sessions', value: Record<string, string>) => {
      blobs = value
    }
  }
  const encryption = {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'test',
    encryptString: (value: string) => {
      const id = String(vault.size)
      vault.set(id, value)
      return Buffer.from(id)
    },
    decryptString: (value: Buffer) => vault.get(value.toString())!
  }
  let store = new AccountStore(new SettingsService(directory), persistence, encryption)
  const account = { ...createOfflineAccount('Steve'), type: 'microsoft' as const }
  const clientId = '11111111-1111-4111-8111-111111111111'
  const identity = {
    homeAccountId: 'home',
    environment: 'login.microsoftonline.com',
    tenantId: 'consumers',
    username: 'test@example.invalid',
    localAccountId: 'local'
  }
  let expired = false
  let restored = false
  let exchanges = 0
  const createClient = (): OAuthClient => {
    let cache = 'initial-cache-with-refresh-token'
    return {
      acquireTokenInteractive: async () => ({
        account: identity,
        accessToken: 'oauth-access-token'
      }),
      acquireTokenSilent: async () => {
        if (expired)
          throw new InteractionRequiredAuthError('interaction_required', 'secret provider detail')
        cache = 'rotated-refresh-token'
        return { account: identity, accessToken: 'new-oauth-token' }
      },
      getTokenCache: () => ({
        serialize: () => cache,
        deserialize: (value) => {
          cache = value
          restored = true
        },
        getAccountByHomeId: async (id) => (id === 'home' ? identity : null)
      })
    }
  }
  const dependencies = {
    createClient,
    exchange: async () => {
      exchanges++
      return { account, accessToken: 'minecraft-token' }
    }
  }
  const first = new MicrosoftAuthService(store, clientId, dependencies)
  assert.deepEqual(await first.login(), account)
  assert.ok(!JSON.stringify(blobs).includes('refresh-token'))
  store = new AccountStore(new SettingsService(directory), persistence, encryption)
  const restarted = new MicrosoftAuthService(store, clientId, dependencies)
  assert.deepEqual(store.getSelectedAccount(), account)
  assert.equal((await restarted.refresh(account)).accessToken, 'minecraft-token')
  assert.equal(restored, true)
  assert.ok(store.readSession(account.id).includes('rotated-refresh-token'))
  assert.equal(exchanges, 2)
  expired = true
  await assert.rejects(
    restarted.refresh(account),
    (error) =>
      error instanceof Error &&
      !error.message.includes('secret provider detail') &&
      'code' in error &&
      error.code === 'MICROSOFT_SESSION_EXPIRED'
  )
  await assert.rejects(new MicrosoftAuthService(store, '', dependencies).login(), {
    code: 'MICROSOFT_CLIENT_ID_MISSING'
  })
  store.removeAccount(account.id)
  assert.deepEqual(blobs, {})
})
