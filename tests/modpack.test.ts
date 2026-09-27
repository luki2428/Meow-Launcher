import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import log from 'electron-log/main'
import { InstanceService } from '../src/main/minecraft/InstanceService'
import { ModpackService } from '../src/main/modpack/ModpackService'
import { manifestSchema, type PackManifest } from '../src/main/modpack/manifest'
import { MinecraftService } from '../src/main/minecraft/MinecraftService'
import { createOfflineAccount } from '../src/main/services/OfflineAccount'
import type { ResolvedVersion } from '@xmcl/core'
import type { InstanceConfig } from '../src/main/shared/validation'

log.transports.file.level = false
log.transports.console.level = false
const sha = (text: string): string => createHash('sha256').update(text).digest('hex')
const file = (path: string, body: string): PackManifest['files'][number] => ({
  path,
  url: 'https://pack.example/' + path,
  sha256: sha(body)
})
const manifest = (version: string, files: PackManifest['files']): PackManifest => ({
  version,
  minecraft: '1.21.1',
  loader: { type: 'vanilla' },
  files
})

interface Fixture {
  directory: string
  instances: InstanceService
  config: InstanceConfig
  service: ModpackService
  game: string
  bodies: Map<string, string>
  update(next?: PackManifest, signal?: AbortSignal): Promise<void>
  downloads(): number
}

async function fixture(t: { after(callback: () => Promise<void>): void }): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), 'meow-modpack-test-'))
  const originalFetch = globalThis.fetch
  t.after(async () => {
    globalThis.fetch = originalFetch
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep))
    await rm(directory, { recursive: true, force: true })
  })
  const instances = new InstanceService(directory)
  const base = await instances.load('main')
  const config = {
    ...base,
    modpack: { manifestUrl: 'https://pack.example/manifest.json', allowedHosts: ['pack.example'] }
  }
  const service = new ModpackService(instances)
  const game = instances.game('main')
  let downloads = 0
  let remote = manifest('1', [file('mods/a.jar', 'a')])
  const bodies = new Map([['mods/a.jar', 'a']])
  globalThis.fetch = async (url) => {
    const path = new URL(String(url)).pathname.slice(1)
    if (path === 'manifest.json') return Response.json(remote)
    downloads++
    const body = bodies.get(path)
    return body === undefined ? new Response('', { status: 404 }) : new Response(body)
  }
  const update = async (next = remote, signal?: AbortSignal): Promise<void> => {
    remote = next
    const checked = await service.check(config, () => {}, signal)
    assert.ok(checked)
    await service.synchronize(config, checked, () => {}, signal)
  }
  return { directory, instances, config, service, game, bodies, update, downloads: () => downloads }
}

test('installs, reuses SHA-256 verified files, repairs corruption even at the same version', async (t) => {
  const f = await fixture(t)
  await f.update()
  assert.equal(await f.service.installedVersion(), '1')
  assert.equal(await readFile(join(f.game, 'mods/a.jar'), 'utf8'), 'a')
  await f.update()
  assert.equal(f.downloads(), 1)
  await writeFile(join(f.game, 'mods/a.jar'), 'corrupt')
  await f.update()
  assert.equal(f.downloads(), 2)
  assert.equal(await readFile(join(f.game, 'mods/a.jar'), 'utf8'), 'a')
})

test('updates changed files and removes only previously managed obsolete files', async (t) => {
  const f = await fixture(t)
  await f.update()
  await writeFile(join(f.game, 'mods/user.jar'), 'user')
  await mkdir(join(f.game, 'saves'))
  await writeFile(join(f.game, 'saves/world'), 'world')
  await writeFile(join(f.game, 'options.txt'), 'options')
  f.bodies.set('mods/b.jar', 'b')
  await f.update(manifest('2', [file('mods/b.jar', 'b')]))
  await assert.rejects(readFile(join(f.game, 'mods/a.jar')), { code: 'ENOENT' })
  assert.equal(await readFile(join(f.game, 'mods/b.jar'), 'utf8'), 'b')
  assert.equal(await readFile(join(f.game, 'mods/user.jar'), 'utf8'), 'user')
  assert.equal(await readFile(join(f.game, 'saves/world'), 'utf8'), 'world')
  assert.equal(await readFile(join(f.game, 'options.txt'), 'utf8'), 'options')
  assert.equal(await f.service.installedVersion(), '2')
})

test('failed download leaves installed files and version intact, retry succeeds', async (t) => {
  const f = await fixture(t)
  await f.update()
  f.bodies.set('mods/a.jar', 'new-a')
  f.bodies.set('mods/b.jar', 'bad')
  const next = manifest('2', [file('mods/a.jar', 'new-a'), file('mods/b.jar', 'b')])
  await assert.rejects(f.update(next), { code: 'CHECKSUM_MISMATCH' })
  assert.equal(await f.service.installedVersion(), '1')
  assert.equal(await readFile(join(f.game, 'mods/a.jar'), 'utf8'), 'a')
  f.bodies.set('mods/b.jar', 'b')
  await f.update(next)
  assert.equal(await f.service.installedVersion(), '2')
  assert.equal(await readFile(join(f.game, 'mods/a.jar'), 'utf8'), 'new-a')
})

test('preserves modified and preexisting configs but updates unchanged defaults', async (t) => {
  const f = await fixture(t)
  f.bodies.set('config/default.json', 'original')
  await f.update(manifest('1', [file('config/default.json', 'original')]))
  f.bodies.set('config/default.json', 'updated')
  await f.update(manifest('2', [file('config/default.json', 'updated')]))
  assert.equal(await readFile(join(f.game, 'config/default.json'), 'utf8'), 'updated')
  await writeFile(join(f.game, 'config/default.json'), 'custom')
  await writeFile(join(f.game, 'config/preexisting.json'), 'local')
  f.bodies.set('config/default.json', 'third')
  await f.update(
    manifest('3', [file('config/default.json', 'third'), file('config/preexisting.json', 'remote')])
  )
  assert.equal(await readFile(join(f.game, 'config/default.json'), 'utf8'), 'custom')
  assert.equal(await readFile(join(f.game, 'config/preexisting.json'), 'utf8'), 'local')
  await f.update(manifest('4', []))
  assert.equal(await readFile(join(f.game, 'config/default.json'), 'utf8'), 'custom')
})

test('rejects traversal, user data paths, Windows aliases, duplicates and file/directory conflicts', () => {
  for (const path of [
    '../evil',
    'mods/../../evil',
    'mods\\evil',
    'mods/a:ads',
    'mods/NUL.jar',
    'mods/x./a',
    'mods//a',
    'mods/./a',
    'saves/a',
    'resourcepacks/a',
    'shaderpacks/a',
    'screenshots/a',
    'options.txt',
    'versions/a'
  ]) {
    assert.equal(manifestSchema.safeParse(manifest('1', [file(path, 'a')])).success, false, path)
  }
  for (const paths of [
    ['mods/a.jar', 'mods/A.jar'],
    ['config/a', 'config/a/b']
  ]) {
    assert.equal(
      manifestSchema.safeParse(
        manifest(
          '1',
          paths.map((path) => file(path, 'a'))
        )
      ).success,
      false
    )
  }
})

test('rejects untrusted download URLs and redirects; network failure prevents launch readiness', async (t) => {
  const f = await fixture(t)
  await assert.rejects(
    f.update(manifest('2', [{ ...file('mods/a.jar', 'a'), url: 'https://evil.example/a' }])),
    { code: 'MODPACK_MANIFEST_FAILED' }
  )
  assert.equal(f.downloads(), 0)
  globalThis.fetch = async () =>
    new Response('', { status: 302, headers: { location: 'http://pack.example/manifest.json' } })
  await assert.rejects(
    f.service.check(f.config, () => {}),
    { code: 'MODPACK_MANIFEST_FAILED' }
  )
  globalThis.fetch = async () => {
    throw new Error('offline')
  }
  await assert.rejects(
    f.service.check(f.config, () => {}),
    { code: 'MODPACK_MANIFEST_FAILED' }
  )
  assert.equal(await f.service.installedVersion(), null)
})

test('refuses directory junctions instead of writing outside the game', async (t) => {
  const f = await fixture(t)
  const outside = join(f.directory, 'outside')
  await mkdir(outside)
  await symlink(outside, join(f.game, 'mods'), 'junction')
  await assert.rejects(f.update(), { code: 'INVALID_PATH' })
  await assert.rejects(readFile(join(outside, 'a.jar')), { code: 'ENOENT' })
})

test('recovers ownership after interrupted commit when the remote manifest changes', async (t) => {
  const f = await fixture(t)
  await f.update()
  await f.service.store.write({
    version: '1',
    files: [file('mods/a.jar', 'a')].map(({ path, sha256 }) => ({ path, sha256 })),
    pending: [{ path: 'mods/interrupted.jar', sha256: sha('partial') }]
  })
  await writeFile(join(f.game, 'mods/interrupted.jar'), 'partial')
  assert.equal(await f.service.installedVersion(), null)
  await f.update(manifest('3', []))
  await assert.rejects(readFile(join(f.game, 'mods/interrupted.jar')), { code: 'ENOENT' })
  await assert.rejects(readFile(join(f.game, 'mods/a.jar')), { code: 'ENOENT' })
  assert.equal(await f.service.installedVersion(), '3')
})

test('failed final state write leaves a recoverable journal instead of claiming success', async (t) => {
  const f = await fixture(t)
  await f.update()
  const write = f.service.store.write.bind(f.service.store)
  f.service.store.write = async (state) => {
    if (!state.pending) throw new Error('disk full')
    await write(state)
  }
  f.bodies.set('mods/b.jar', 'b')
  await assert.rejects(f.update(manifest('2', [file('mods/b.jar', 'b')])), {
    code: 'MODPACK_UPDATE_FAILED'
  })
  assert.equal(await f.service.installedVersion(), null)
  assert.equal(await readFile(join(f.game, 'mods/b.jar'), 'utf8'), 'b')
  f.service.store.write = write
  await f.update(manifest('3', []))
  assert.equal(await f.service.installedVersion(), '3')
  await assert.rejects(readFile(join(f.game, 'mods/b.jar')), { code: 'ENOENT' })
})

test('cancelling download keeps the old version and removes temporary data', async (t) => {
  const f = await fixture(t)
  await f.update()
  const controller = new AbortController()
  globalThis.fetch = async () => {
    controller.abort()
    return new Response('new')
  }
  await assert.rejects(
    f.service.synchronize(
      f.config,
      manifest('2', [file('mods/a.jar', 'new')]),
      () => {},
      controller.signal
    ),
    { code: 'MODPACK_CANCELLED' }
  )
  assert.equal(await readFile(join(f.game, 'mods/a.jar'), 'utf8'), 'a')
  assert.equal(await f.service.installedVersion(), '1')
  await assert.rejects(readFile(join(f.instances.root('main'), 'modpack-staging/0.download.tmp')), {
    code: 'ENOENT'
  })
})

test('launch updates the pack before Java/game and uses manifest versions; failure blocks launch', async (t) => {
  const f = await fixture(t)
  await writeFile(join(f.instances.root('main'), 'instance.json'), JSON.stringify(f.config))
  const account = createOfflineAccount('Steve')
  let launched = 0
  const calls: string[] = []
  const service = new MinecraftService(
    f.instances,
    {
      getValidMinecraftSession: async () => ({ account, accessToken: '0' })
    },
    {
      ensureRuntime: async (config) => {
        calls.push('java')
        assert.equal(config.minecraft, '1.21.2')
        assert.equal(await f.service.installedVersion(), '2')
        return 'java.exe'
      }
    },
    {
      ensureMinecraftInstalled: async () => ({}) as ResolvedVersion,
      ensureLoaderInstalled: async () => '1.21.2'
    },
    {
      launch: async () => {
        launched++
      }
    },
    { running: false },
    {
      check: async () => ({ ...manifest('2', [file('mods/a.jar', 'a')]), minecraft: '1.21.2' }),
      synchronize: async (...args) => {
        calls.push('modpack')
        await f.service.synchronize(...args)
      }
    }
  )
  const options = { accountId: account.id, instanceId: 'main', minMemoryMb: 512, maxMemoryMb: 1024 }
  await service.launch(options)
  assert.deepEqual(calls, ['modpack', 'java'])
  assert.equal(launched, 1)
  await writeFile(join(f.game, 'mods/a.jar'), 'bad')
  f.bodies.set('mods/a.jar', 'wrong')
  await assert.rejects(service.launch(options), { code: 'CHECKSUM_MISMATCH' })
  assert.equal(launched, 1)
  assert.equal(service.getState().state, 'error')
})
