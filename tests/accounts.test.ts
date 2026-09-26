import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { SettingsService } from '../src/main/services/SettingsService'
import { createOfflineAccount } from '../src/main/services/OfflineAccount'

function fixture(t: { after: (callback: () => void) => void }): string {
  const directory = mkdtempSync(join(tmpdir(), 'meow-account-test-'))
  t.after(() => {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep))
    rmSync(directory, { recursive: true, force: true })
  })
  return directory
}
test('offline UUID matches the Minecraft Notch reference', () => {
  assert.equal(createOfflineAccount('Notch').uuid, 'b50ad385-829d-3141-a216-7e7d7539ba7f')
})
test('migrates RAM settings and persists profiles, selection and renamed UUID', (t) => {
  const directory = fixture(t)
  writeFileSync(join(directory, 'settings.json'), '{"ram":1024}')
  const service = new SettingsService(directory)
  assert.equal(service.warning, null)
  assert.equal(service.saveOfflineAccount('Notch', undefined).ok, true)
  const first = service.getSettings().selectedAccount!
  assert.equal(service.saveOfflineAccount('Alex', undefined).ok, true)
  assert.equal(service.selectAccount(first).ok, true)
  assert.equal(service.setRam(1024).ok, true)
  const restored = new SettingsService(directory)
  assert.equal(restored.getSettings().selectedAccount, first)
  assert.equal(restored.getSettings().accounts.length, 2)
  assert.equal(restored.saveOfflineAccount('Steve', first).ok, true)
  assert.equal(restored.getSettings().selectedAccount, createOfflineAccount('Steve').uuid)
  assert.equal(restored.selectAccount(null).ok, true)
  assert.equal(restored.removeAccount(createOfflineAccount('Steve').uuid).ok, true)
  assert.equal(new SettingsService(directory).getSettings().accounts.length, 1)
})
test('rejects invalid IPC values and duplicate names without changing saved state', (t) => {
  const service = new SettingsService(fixture(t))
  service.saveOfflineAccount('Notch', undefined)
  const before = service.getSettings()
  for (const username of ['', 'aa', '../abc', 'a'.repeat(17), 'Łukasz', null, 42, {}]) {
    assert.equal(service.saveOfflineAccount(username, undefined).ok, false)
  }
  assert.equal(service.saveOfflineAccount('notch', undefined).ok, false)
  assert.equal(service.saveOfflineAccount('Alex', 'missing').ok, false)
  assert.equal(service.selectAccount({}).ok, false)
  assert.equal(service.removeAccount('missing').ok, false)
  assert.equal(service.setRam(-1).ok, false)
  assert.deepEqual(service.getSettings(), before)
})
test('failed disk write leaves active profile unchanged', (t) => {
  const directory = fixture(t)
  const blocked = join(directory, 'blocked')
  writeFileSync(blocked, 'not a directory')
  const service = new SettingsService(blocked)
  const before = service.getSettings()
  assert.equal(service.saveOfflineAccount('Alex', undefined).ok, false)
  assert.deepEqual(service.getSettings(), before)
})
