import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { SettingsService } from '../src/main/services/SettingsService'
import { InstanceService } from '../src/main/minecraft/InstanceService'
import type { GamePreferences } from '../src/shared/types'

function fixture(t: { after: (callback: () => void) => void }): string {
  const path = mkdtempSync(join(tmpdir(), 'meow-settings-'))
  t.after(() => {
    assert.ok(resolve(path).startsWith(resolve(tmpdir()) + sep))
    rmSync(path, { recursive: true, force: true })
  })
  return path
}
function preferences(service: SettingsService): GamePreferences {
  const { ram, installationDirectory, windowWidth, windowHeight, fullscreen } =
    service.getSettings()
  return { ram, installationDirectory, windowWidth, windowHeight, fullscreen }
}
test('migrates existing settings without moving the installation or losing accounts', (t) => {
  const root = fixture(t)
  const service = new SettingsService(root)
  service.saveOfflineAccount('Steve', undefined)
  const { ram, accounts, selectedAccount } = service.getSettings()
  writeFileSync(join(root, 'settings.json'), JSON.stringify({ ram, accounts, selectedAccount }))
  const migrated = new SettingsService(root)
  assert.equal(migrated.warning, null)
  assert.equal(migrated.getSettings().selectedAccount, selectedAccount)
  assert.equal(migrated.getSettings().installationDirectory, root)
  assert.equal(migrated.getSettings().windowWidth, 1280)
})
test('switches installation and runtime roots, preserves old saves and persists preferences', async (t) => {
  const root = fixture(t)
  const service = new SettingsService(root)
  const instances = new InstanceService(() => service.getSettings().installationDirectory)
  await instances.load('main')
  const oldGame = instances.game('main')
  mkdirSync(join(oldGame, 'saves'))
  writeFileSync(join(oldGame, 'saves', 'world.dat'), 'keep me')
  const next = join(root, 'new installation')
  mkdirSync(next)
  assert.equal(
    service.savePreferences({
      ...preferences(service),
      installationDirectory: next,
      windowWidth: 1920,
      windowHeight: 1080,
      fullscreen: true
    }).ok,
    true
  )
  await instances.load('main')
  assert.equal(instances.game('main'), join(next, 'instances', 'main', 'game'))
  assert.equal(readFileSync(join(oldGame, 'saves', 'world.dat'), 'utf8'), 'keep me')
  assert.deepEqual(new SettingsService(root).getSettings(), service.getSettings())
})
test('rejects malformed preferences and unavailable directories without partial saves', (t) => {
  const root = fixture(t)
  const service = new SettingsService(root)
  const before = service.getSettings()
  for (const patch of [
    { installationDirectory: '../escape' },
    { installationDirectory: join(root, 'missing') },
    { windowWidth: 0 },
    { windowHeight: 9000 },
    { fullscreen: 'yes' },
    { ram: 123 },
    { accounts: [] },
    { windowWidth: 854.5 }
  ]) {
    assert.equal(service.savePreferences({ ...preferences(service), ...patch }).ok, false)
    assert.deepEqual(service.getSettings(), before)
  }
})
