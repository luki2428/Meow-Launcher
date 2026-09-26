import { app, BrowserWindow, safeStorage } from 'electron'
import Store from 'electron-store'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { AccountStore } from '../src/main/auth/AccountStore'
import { SettingsService } from '../src/main/services/SettingsService'
import { createLauncher } from '../src/main/services/createLauncher'
import { registerHandlers } from '../src/main/ipc/registerHandlers'

app.setPath('userData', resolve('.smoke/electron'))
void app
  .whenReady()
  .then(async () => {
    const directory = app.getPath('userData')
    const blobs = new Store<{ sessions: Record<string, string> }>({
      cwd: directory,
      name: 'smoke-secrets',
      defaults: { sessions: {} }
    })
    const accounts = new AccountStore(new SettingsService(directory), blobs, safeStorage)
    accounts.writeSession('smoke', 'fake-test-refresh-token')
    assert.ok(!readFileSync(blobs.path, 'utf8').includes('fake-test-refresh-token'))
    assert.equal(accounts.readSession('smoke'), 'fake-test-refresh-token')
    const launcher = createLauncher()
    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: resolve('out/preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    const url = pathToFileURL(resolve('out/renderer/index.html')).href
    registerHandlers(window, url, launcher)
    await window.loadURL(url)
    const result = await window.webContents.executeJavaScript(`(async () => {
    const added = await window.launcher.auth.loginOffline('SmokeIPC');
    const accounts = await window.launcher.auth.getAccounts();
    const state = await window.launcher.minecraft.getState();
    const rejected = await window.launcher.minecraft.launch({ instanceId: '../escape', javaPath: 'evil.exe' });
    const removed = added.ok ? await window.launcher.auth.logout(added.data.id) : null;
    return { added, accounts, state, rejected, removed, nodeVisible: typeof window.require };
  })()`)
    assert.equal(result.added.ok, true)
    assert.equal(result.accounts.ok, true)
    assert.equal(result.state.data.state, 'idle')
    assert.equal(result.rejected.ok, false)
    assert.equal(result.removed.ok, true)
    assert.equal(result.nodeVisible, 'undefined')
    assert.ok(!JSON.stringify(result).includes('fake-test-refresh-token'))
    console.log(
      'PASS: real Electron safeStorage encryption/decryption; sandboxed preload, account IPC, state IPC, rejected unsafe launch.'
    )
    writeFileSync(
      resolve('.smoke/electron-report.json'),
      JSON.stringify({ ok: true, encryption: true, ipc: true, sandbox: true })
    )
    window.destroy()
    app.exit(0)
  })
  .catch((error: unknown) => {
    writeFileSync(
      resolve('.smoke/electron-report.json'),
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
    )
    app.exit(1)
  })
