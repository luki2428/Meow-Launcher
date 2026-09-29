import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import log from 'electron-log/main'
import { UpdateService, type Updater } from '../src/main/services/UpdateService'

log.transports.file.level = false
log.transports.console.level = false

function fixture(): {
  service: UpdateService
  updater: Updater
  events: EventEmitter
  checks: () => number
  installs: () => number
  setActive: (value: boolean) => void
} {
  const events = new EventEmitter()
  let checks = 0
  let installs = 0
  let active = false
  const updater: Updater = {
    on: events.on.bind(events) as Updater['on'],
    autoDownload: false,
    autoInstallOnAppQuit: true,
    allowPrerelease: true,
    allowDowngrade: true,
    logger: null,
    checkForUpdates: async () => {
      checks++
      return null
    },
    quitAndInstall: (silent, restart) => {
      assert.equal(silent, false)
      assert.equal(restart, true)
      installs++
    }
  }
  const service = new UpdateService(updater, () => active)
  return {
    service,
    updater,
    events,
    checks: () => checks,
    installs: () => installs,
    setActive: (value: boolean) => {
      active = value
    }
  }
}

test('development never checks; packaged startup checks once and only stable newer releases', async () => {
  const f = fixture()
  await f.service.start(false)
  assert.equal(f.checks(), 0)
  await f.service.start(true)
  await f.service.start(true)
  assert.equal(f.checks(), 1)
  assert.equal(f.updater.autoDownload, true)
  assert.equal(f.updater.allowPrerelease, false)
  assert.equal(f.updater.allowDowngrade, false)
  assert.equal(f.updater.autoInstallOnAppQuit, false)
  f.events.emit('update-not-available')
  assert.equal(f.service.getState().stage, 'current')
})

test('download progress does not trigger installation; verified download restarts once', async () => {
  const f = fixture()
  await f.service.start(true)
  f.events.emit('update-available')
  f.events.emit('download-progress', { percent: 75.4 })
  assert.equal(f.service.getState().progress, 75)
  f.service.installIfIdle()
  assert.equal(f.installs(), 0)
  f.events.emit('update-downloaded')
  f.service.installIfIdle()
  assert.equal(f.installs(), 1)
  assert.equal(f.service.getState().stage, 'installing')
})

test('game installation or running game defers launcher restart until idle', async () => {
  const f = fixture()
  f.setActive(true)
  await f.service.start(true)
  f.events.emit('update-downloaded')
  assert.equal(f.installs(), 0)
  assert.equal(f.service.getState().stage, 'ready')
  f.setActive(false)
  f.service.installIfIdle()
  assert.equal(f.installs(), 1)
})

test('offline or missing release is nonfatal and never installs', async () => {
  const f = fixture()
  f.updater.checkForUpdates = async () => {
    throw new Error('network unavailable')
  }
  await f.service.start(true)
  assert.equal(f.service.getState().stage, 'error')
  assert.equal(f.installs(), 0)
})

test('download failure or checksum mismatch never installs', async () => {
  const f = fixture()
  await f.service.start(true)
  f.events.emit('update-available')
  f.events.emit('error', new Error('checksum mismatch'))
  f.service.installIfIdle()
  assert.equal(f.service.getState().stage, 'error')
  assert.equal(f.installs(), 0)
})
