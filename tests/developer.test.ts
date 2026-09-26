import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { SettingsService } from '../src/main/services/SettingsService'
import { DeveloperPackService } from '../src/main/services/DeveloperPackService'
import { InstanceService } from '../src/main/minecraft/InstanceService'
import { DEFAULT_DEVELOPER_PACK } from '../src/shared/developer'

function fixture(t: { after: (callback: () => void) => void }): string {
  const path = mkdtempSync(join(tmpdir(), 'meow-developer-'))
  t.after(() => {
    assert.ok(resolve(path).startsWith(resolve(tmpdir()) + sep))
    rmSync(path, { recursive: true, force: true })
  })
  return path
}

test('generates and loads a local NeoForge pack without network; preserves main instance and persists mode', async (t) => {
  const root = fixture(t)
  const settings = new SettingsService(root)
  const developer = new DeveloperPackService(settings)
  const instances = new InstanceService(
    () => settings.getSettings().installationDirectory,
    developer
  )
  const main = await instances.load('main')
  const originalPath = instances.root('main')
  const original = readFileSync(join(originalPath, 'instance.json'), 'utf8')
  mkdirSync(join(instances.game('main'), 'saves'))
  writeFileSync(join(instances.game('main'), 'saves', 'world'), 'untouched')
  const fetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw new Error('Local source must not use network')
  }
  t.after(() => {
    globalThis.fetch = fetch
  })
  developer.generate(DEFAULT_DEVELOPER_PACK)
  assert.deepEqual(developer.read().files, [])
  assert.equal(settings.setDeveloperMode(true).ok, true)
  const config = await instances.load('main')
  assert.deepEqual(config.loader, { type: 'neoforge', version: '21.1.172' })
  assert.equal(config.minecraft, '1.21.1')
  assert.equal(config.java.majorVersion, 21)
  assert.equal(instances.root('main'), join(root, 'instances', 'developer'))
  assert.equal(readFileSync(join(originalPath, 'instance.json'), 'utf8'), original)
  assert.equal(readFileSync(join(originalPath, 'game', 'saves', 'world'), 'utf8'), 'untouched')
  assert.equal(new SettingsService(root).getSettings().developerMode, true)
  settings.setDeveloperMode(false)
  assert.deepEqual(await instances.load('main'), main)
  assert.equal(instances.root('main'), originalPath)
})

test('regeneration keeps test worlds; vanilla is accepted; unsafe or incompatible inputs cannot replace the manifest', async (t) => {
  const settings = new SettingsService(fixture(t))
  const developer = new DeveloperPackService(settings)
  const instances = new InstanceService(
    () => settings.getSettings().installationDirectory,
    developer
  )
  developer.generate(DEFAULT_DEVELOPER_PACK)
  settings.setDeveloperMode(true)
  await instances.load('main')
  const marker = join(instances.game('main'), 'options.txt')
  writeFileSync(marker, 'keep')
  developer.generate({ loader: 'vanilla', loaderVersion: '' })
  assert.deepEqual((await instances.load('main')).loader, { type: 'vanilla' })
  assert.equal(readFileSync(marker, 'utf8'), 'keep')
  const before = readFileSync(developer.manifestPath, 'utf8')
  for (const options of [
    { loader: 'neoforge', loaderVersion: '20.4.1' },
    { loader: 'neoforge', loaderVersion: '../escape' },
    { ...DEFAULT_DEVELOPER_PACK, url: 'https://evil.example' },
    { ...DEFAULT_DEVELOPER_PACK, javaPath: 'evil.exe' },
    { loader: 'unknown', loaderVersion: '21.1.172' }
  ]) {
    assert.throws(() => developer.generate(options))
    assert.equal(readFileSync(developer.manifestPath, 'utf8'), before)
  }
})

test('enabled local source fails closed when its manifest is missing, corrupt or contains remote files', async (t) => {
  const settings = new SettingsService(fixture(t))
  const developer = new DeveloperPackService(settings)
  const instances = new InstanceService(
    () => settings.getSettings().installationDirectory,
    developer
  )
  settings.setDeveloperMode(true)
  await assert.rejects(instances.load('main'), { code: 'LOCAL_PACK_INVALID' })
  developer.generate(DEFAULT_DEVELOPER_PACK)
  const valid = developer.read()
  for (const contents of [
    '{ broken',
    JSON.stringify({ ...valid, files: [{ path: 'mods/evil.jar', url: 'https://evil.example' }] }),
    JSON.stringify({ ...valid, minecraft: '1.20.1' })
  ]) {
    writeFileSync(developer.manifestPath, contents)
    await assert.rejects(instances.load('main'), { code: 'LOCAL_PACK_INVALID' })
    assert.ok(developer.info().error)
  }
})

test('generator refuses linked developer directories without writing outside its root', (t) => {
  const root = fixture(t)
  const other = fixture(t)
  const settings = new SettingsService(root)
  const developer = new DeveloperPackService(settings)
  symlinkSync(other, developer.directory, 'junction')
  assert.throws(() => developer.generate(DEFAULT_DEVELOPER_PACK), { code: 'INVALID_PATH' })
})
