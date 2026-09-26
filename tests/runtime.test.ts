import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import log from 'electron-log/main'
import { JavaService, type JavaVersion } from '../src/main/java/JavaService'
import { InstanceService } from '../src/main/minecraft/InstanceService'
import { instanceSchema, launchSchema, inside } from '../src/main/shared/validation'
import { trustedUrl, downloadVerified } from '../src/main/shared/network'
import { AccountStore } from '../src/main/auth/AccountStore'
import { AuthService } from '../src/main/auth/AuthService'
import { SettingsService } from '../src/main/services/SettingsService'
import { createOfflineAccount } from '../src/main/services/OfflineAccount'
import { MinecraftService } from '../src/main/minecraft/MinecraftService'
import { GameProcessService, redactLine } from '../src/main/minecraft/GameProcessService'
import { LauncherError, safeError } from '../src/main/shared/LauncherError'
import { createHash } from 'node:crypto'
import type { GameSnapshot } from '../src/shared/game'
import type { ResolvedVersion } from '@xmcl/core'

log.transports.file.level = false
log.transports.console.level = false
function fixture(t: { after(callback: () => void): void }): string {
  const directory = mkdtempSync(join(tmpdir(), 'meow-runtime-test-'))
  t.after(() => {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep))
    rmSync(directory, { recursive: true, force: true })
  })
  return directory
}
const config = instanceSchema.parse({
  id: 'main',
  minecraft: '1.21.1',
  java: { majorVersion: 21, architecture: 'x64' },
  loader: { type: 'vanilla' }
})
const valid: JavaVersion = { majorVersion: 21, version: '21.0.9', architecture: 'amd64' }

for (const [label, initial] of [
  ['missing', null],
  ['wrong major', { ...valid, majorVersion: 17 }],
  ['wrong architecture', { ...valid, architecture: 'x86' }],
  ['valid', valid]
] as const) {
  test(`managed Java: ${label}, reuses the verified runtime on next launch`, async (t) => {
    const instances = new InstanceService(fixture(t))
    let runtime: JavaVersion | null = initial
    let downloads = 0
    const paths: string[] = []
    const service = new JavaService(
      instances,
      {
        install: async (_config, root, verify) => {
          downloads++
          assert.ok(root.endsWith(join('runtime', 'java')))
          runtime = valid
          assert.ok(await verify(root))
        }
      },
      async (root) => {
        paths.push(root)
        return runtime
      }
    )
    const first = await service.ensureRuntime(config, () => {})
    const second = await service.ensureRuntime(config, () => {})
    assert.equal(first, second)
    assert.ok(first.endsWith(join('instances', 'main', 'runtime', 'java', 'bin', 'java.exe')))
    assert.equal(downloads, label === 'valid' ? 0 : 1)
    assert.ok(paths.every((path) => path.startsWith(instances.root('main'))))
  })
}
test('corrupted Java installation never becomes ready and never falls back to PATH', async (t) => {
  const service = new JavaService(
    new InstanceService(fixture(t)),
    { install: async () => {} },
    async () => null
  )
  await assert.rejects(
    service.ensureRuntime(config, () => {}),
    { code: 'JAVA_RUNTIME_INVALID' }
  )
})

test('account metadata survives restart, encrypted session is removed on logout', async (t) => {
  const directory = fixture(t)
  let blobs: Record<string, string> = {}
  // Test double for an OS keystore, not a production encryption implementation.
  const vault = new Map<string, string>()
  let available = true
  const encryption = {
    isEncryptionAvailable: () => available,
    getSelectedStorageBackend: () => 'test-keychain',
    encryptString: (value: string) => {
      const key = `opaque-${vault.size}`
      vault.set(key, value)
      return Buffer.from(key)
    },
    decryptString: (blob: Buffer) => {
      const value = vault.get(blob.toString())
      if (!value) throw new Error('corrupt')
      return value
    }
  }
  const storage = {
    get: () => blobs,
    set: (_key: 'sessions', value: Record<string, string>) => {
      blobs = value
    }
  }
  let store = new AccountStore(new SettingsService(directory), storage, encryption)
  const account = { ...createOfflineAccount('Steve'), type: 'microsoft' as const }
  store.addAccount(account)
  store.writeSession(account.id, 'secret-refresh-token')
  assert.ok(!JSON.stringify(blobs).includes('secret-refresh-token'))
  assert.ok(
    !readFileSync(join(directory, 'settings.json'), 'utf8').includes('secret-refresh-token')
  )
  store = new AccountStore(new SettingsService(directory), storage, encryption)
  assert.deepEqual(store.getSelectedAccount(), account)
  assert.equal(store.readSession(account.id), 'secret-refresh-token')
  available = false
  assert.throws(() => store.writeSession(account.id, 'secret'), {
    code: 'SECURE_STORAGE_UNAVAILABLE'
  })
  store.removeAccount(account.id)
  assert.equal(store.getSelectedAccount(), null)
  assert.equal(store.getAccounts().length, 0)
  assert.deepEqual(blobs, {})
})

test('auth refresh is Main-only; logout waits for a pending refresh then deletes session', async (t) => {
  const settings = new SettingsService(fixture(t))
  const account = { ...createOfflineAccount('Steve'), type: 'microsoft' as const }
  let blobs: Record<string, string> = { [account.id]: 'opaque' }
  const store = new AccountStore(
    settings,
    {
      get: () => blobs,
      set: (_key, value) => {
        blobs = value
      }
    },
    {
      isEncryptionAvailable: () => false,
      getSelectedStorageBackend: () => '',
      encryptString: () => {
        throw new Error()
      },
      decryptString: () => {
        throw new Error()
      }
    }
  )
  store.addAccount(account)
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const auth = new AuthService(store, {
    login: async () => account,
    refresh: async (selected) => {
      await pending
      return { account: selected, accessToken: 'only-main' }
    }
  })
  const refresh = auth.getValidMinecraftSession(account.id)
  const logout = auth.logout(account.id)
  release()
  assert.equal((await refresh).accessToken, 'only-main')
  await logout
  assert.deepEqual(blobs, {})
  await assert.rejects(auth.getValidMinecraftSession(account.id), { code: 'INVALID_ACCOUNT' })
})

test('launch orchestration locks preparation and uses managed Java; failure allows retry', async (t) => {
  const instances = new InstanceService(fixture(t))
  const account = createOfflineAccount('Steve')
  const calls: string[] = []
  let fail = true
  const service = new MinecraftService(
    instances,
    {
      getValidMinecraftSession: async () => {
        calls.push('auth')
        return { account, accessToken: '0' }
      }
    },
    {
      ensureRuntime: async () => {
        calls.push('java')
        return join(instances.root('main'), 'runtime', 'java', 'bin', 'java.exe')
      }
    },
    {
      ensureMinecraftInstalled: async () => {
        calls.push('minecraft')
        if (fail) throw new LauncherError('MINECRAFT_INSTALL_FAILED', 'test')
        return {} as ResolvedVersion
      },
      ensureLoaderInstalled: async () => {
        calls.push('loader')
        return '1.21.1'
      }
    },
    {
      launch: async (_options, session, java, _game, _version, update) => {
        calls.push('launch')
        assert.equal(session.account.uuid, account.uuid)
        assert.ok(java.endsWith('java.exe'))
        update({ state: 'running', pid: 1 })
      }
    },
    { running: false }
  )
  const options = { accountId: account.id, instanceId: 'main', minMemoryMb: 512, maxMemoryMb: 1024 }
  const first = service.launch(options)
  await assert.rejects(service.launch(options), { code: 'GAME_ALREADY_RUNNING' })
  await assert.rejects(first, { code: 'MINECRAFT_INSTALL_FAILED' })
  assert.equal(service.getState().state, 'error')
  fail = false
  calls.length = 0
  await service.launch(options)
  assert.deepEqual(calls, ['auth', 'java', 'minecraft', 'loader', 'auth', 'launch'])
  assert.equal(service.getState().state, 'running')
})

for (const exitCode of [0, 1]) {
  test(`real child process exit ${exitCode} updates state and releases lock`, async () => {
    const processes = new GameProcessService()
    const child = spawn(process.execPath, ['-e', `process.exit(${exitCode})`], {
      windowsHide: true
    })
    const terminal = await new Promise<GameSnapshot>((resolve) => {
      processes.monitor(child, [], (state) => {
        if (state.state === 'stopped' || state.state === 'error') resolve(state)
      })
      assert.equal(processes.running, true)
    })
    assert.equal(terminal.exitCode, exitCode)
    assert.equal(terminal.state, exitCode === 0 ? 'stopped' : 'error')
    assert.equal(processes.running, false)
  })
}
test('spawn failure is handled without an unhandled child error', async () => {
  const processes = new GameProcessService()
  const child = spawn(join(tmpdir(), 'meow-nonexistent-executable.exe'))
  const terminal = await new Promise<GameSnapshot>((resolve) =>
    processes.monitor(child, [], (state) => {
      if (state.state === 'error') resolve(state)
    })
  )
  assert.equal(terminal.error?.code, 'MINECRAFT_LAUNCH_FAILED')
  assert.equal(processes.running, false)
})

test('IPC schemas reject filesystem/JVM injection, path traversal and unsupported loaders', () => {
  const options = { accountId: 'test', instanceId: 'main', minMemoryMb: 512, maxMemoryMb: 1024 }
  for (const payload of [
    { ...options, javaPath: 'evil.exe' },
    { ...options, extraJVMArgs: ['evil'] },
    { ...options, instanceId: '../main' },
    { ...options, minMemoryMb: 2048 }
  ])
    assert.equal(launchSchema.safeParse(payload).success, false)
  for (const path of [
    '../escape',
    'C:/escape',
    '/escape',
    'a\\b',
    'mods/../../escape',
    'file:stream',
    'a./file'
  ])
    assert.throws(() => inside('C:/instance', path))
  assert.equal(instanceSchema.safeParse({ ...config, loader: { type: 'unknown' } }).success, false)
  assert.throws(() => trustedUrl('http://api.adoptium.net/file', ['api.adoptium.net']))
  assert.throws(() => trustedUrl('https://evil.example/file', ['api.adoptium.net']))
  assert.equal(
    redactLine('token-secret Bearer abc access_token=xyz', ['token-secret']),
    '[REDACTED] Bearer [REDACTED] access_token=[REDACTED]'
  )
  assert.ok(!safeError(new Error('token-secret')).message.includes('token-secret'))
})

test('download uses temp files, verifies SHA-256 and preserves old file on mismatch', async (t) => {
  const directory = fixture(t)
  const destination = join(directory, 'runtime.zip')
  const payload = Buffer.from('valid-runtime')
  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  globalThis.fetch = async () => new Response(payload)
  await downloadVerified(
    'https://example.com/java',
    ['example.com'],
    destination,
    createHash('sha256').update(payload).digest('hex'),
    payload.length,
    () => {}
  )
  assert.equal(readFileSync(destination, 'utf8'), 'valid-runtime')
  globalThis.fetch = async () => new Response(Buffer.from('evil'))
  await assert.rejects(
    downloadVerified(
      'https://example.com/java',
      ['example.com'],
      destination,
      '0'.repeat(64),
      4,
      () => {}
    ),
    { code: 'CHECKSUM_MISMATCH' }
  )
  assert.equal(readFileSync(destination, 'utf8'), 'valid-runtime')
})

test('instance config persists edits and refuses arbitrary executable fields', async (t) => {
  const instances = new InstanceService(fixture(t))
  await instances.load('main')
  const file = join(instances.root('main'), 'instance.json')
  writeFileSync(file, JSON.stringify({ ...config, java: { ...config.java, majorVersion: 17 } }))
  assert.equal((await instances.load('main')).java.majorVersion, 17)
  writeFileSync(file, JSON.stringify({ ...config, javaPath: 'evil.exe' }))
  await assert.rejects(instances.load('main'))
})
