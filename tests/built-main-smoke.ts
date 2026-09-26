// Exercise the actual electron-vite output, not a separately bundled copy of the services.
import { app, dialog } from 'electron'
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const directory = resolve('.smoke/built-main')
mkdirSync(directory, { recursive: true })
app.setPath('userData', directory)
let finished = false
const finish = (error?: unknown): void => {
  if (finished) return
  finished = true
  writeFileSync(
    resolve('.smoke/built-main-report.json'),
    JSON.stringify({
      ok: error === undefined,
      error:
        error instanceof Error ? error.message : error === undefined ? undefined : String(error)
    })
  )
  app.exit(error === undefined ? 0 : 1)
}
process.on('unhandledRejection', finish)
process.on('uncaughtException', finish)
dialog.showErrorBox = (_title, message): void => finish(new Error(message))
setTimeout(() => finish(new Error('Built Main did not become ready within 20 seconds')), 20_000)
app.on('browser-window-created', (_event, window) => {
  // The production window calls show on ready-to-show; keep this test hidden.
  window.show = (): void => {}
  window.webContents.once('did-finish-load', () => {
    void window.webContents
      .executeJavaScript(
        `(async () => ({
      snapshot: await window.launcher.getSnapshot(),
      accounts: await window.launcher.auth.getAccounts(),
      state: await window.launcher.minecraft.getState(),
      nodeVisible: typeof window.require
    }))()`
      )
      .then((result) => {
          assert.equal(result.snapshot.version, app.getVersion())
        assert.equal(result.accounts.ok, true)
        assert.equal(result.state.data.state, 'idle')
        assert.equal(result.nodeVisible, 'undefined')
        finish()
      })
      .catch(finish)
  })
})
createRequire(__filename)(resolve('out/main/index.js'))
