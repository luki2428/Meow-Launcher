import { app, BrowserWindow, dialog } from 'electron'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { createLauncher } from '../src/main/services/createLauncher'
import { registerHandlers } from '../src/main/ipc/registerHandlers'

const root = resolve('.smoke/settings')
mkdirSync(root, { recursive: true })
app.setPath('userData', root)
const finish = (error?: unknown): void => {
  writeFileSync(
    resolve('.smoke/settings-report.json'),
    JSON.stringify({ ok: !error, error: error instanceof Error ? error.message : error })
  )
  app.exit(error ? 1 : 0)
}
setTimeout(() => finish(new Error('Timeout')), 25000)
void app
  .whenReady()
  .then(async () => {
    const launcher = createLauncher()
    const window = new BrowserWindow({
      width: 1100,
      height: 760,
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
    const next = resolve(root, 'new-installation')
    mkdirSync(next, { recursive: true })
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [next]
    })) as typeof dialog.showOpenDialog
    await window.loadURL(url)
    const evaluate = (script: string): Promise<unknown> =>
      window.webContents.executeJavaScript(script)
    const result = (await evaluate(`(async () => {
    const s = (await window.launcher.getSnapshot()).settings;
    const p = { ram:s.ram, installationDirectory:s.installationDirectory, windowWidth:1600, windowHeight:900, fullscreen:true };
    const rejected = await window.launcher.savePreferences({...p, installationDirectory: ${JSON.stringify(resolve(root, 'not-chosen'))}});
    const picked = await window.launcher.chooseInstallationDirectory();
    const saved = await window.launcher.savePreferences({...p, installationDirectory:picked.data});
    const malformed = await window.launcher.savePreferences({...p, windowWidth:0});
    return { rejected, picked, saved, malformed };
  })()`)) as {
      rejected: { ok: boolean }
      picked: { data: string }
      saved: { ok: boolean }
      malformed: { ok: boolean }
    }
    assert.equal(result.rejected.ok, false)
    assert.equal(result.picked.data, next)
    assert.equal(result.saved.ok, true)
    assert.equal(result.malformed.ok, false)
    const getState = launcher.minecraft.getState.bind(launcher.minecraft)
    launcher.minecraft.getState = () => ({ state: 'running' })
    const blocked = (await evaluate(`(async () => {
      const s = (await window.launcher.getSnapshot()).settings;
      return window.launcher.savePreferences({ ram: s.ram, installationDirectory: s.installationDirectory, windowWidth: 1280, windowHeight: 720, fullscreen: false });
    })()`)) as { ok: boolean }
    assert.equal(blocked.ok, false)
    for (const action of [
      `window.launcher.generateDeveloperPack({ loader: 'neoforge', loaderVersion: '21.1.172' })`,
      `window.launcher.setDeveloperMode(true)`
    ]) {
      const denied = (await evaluate(action)) as { ok: boolean; error: { code: string } }
      assert.equal(denied.ok, false)
      assert.equal(denied.error.code, 'GAME_BUSY')
    }
    launcher.minecraft.getState = getState
    // Open a fresh renderer so its snapshot contains the saved values.
    await new Promise<void>((resolve) => {
      window.webContents.once('did-finish-load', () => resolve())
      window.reload()
    })
    await evaluate(`new Promise((resolve, reject) => {
    let attempts = 0;
    const timer = setInterval(() => {
      const button = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Ustawienia'));
      if (button && !button.disabled) { clearInterval(timer); button.click(); setTimeout(resolve, 150); }
      else if (++attempts > 50) { clearInterval(timer); reject(new Error('Missing settings button')); }
    }, 100);
  })`)
    assert.equal(await evaluate(`document.getElementById('window-width').value`), '1600')
    assert.equal(await evaluate(`document.getElementById('fullscreen').checked`), true)
    const screenshot = await window.webContents.capturePage()
    writeFileSync(resolve('.smoke/settings-preview.png'), screenshot.toPNG())
    for (const name of ['Pliki gry', 'Okno gry']) {
      await evaluate(`new Promise(resolve => {
        [...document.querySelectorAll('nav button')].find(button => button.textContent === ${JSON.stringify(name)}).click();
        setTimeout(resolve, 100);
      })`)
      writeFileSync(
        resolve(name === 'Pliki gry' ? '.smoke/settings-files.png' : '.smoke/settings-window.png'),
        (await window.webContents.capturePage()).toPNG()
      )
    }
    await evaluate(`new Promise(resolve => {
      [...document.querySelectorAll('nav button')].find(button => button.textContent === 'Deweloper').click();
      setTimeout(resolve, 150);
    })`)
    await evaluate(`new Promise((resolve, reject) => {
      [...document.querySelectorAll('button')].find(button => button.textContent === 'Wygeneruj i użyj lokalnej paczki').click();
      let attempts = 0;
      const timer = setInterval(() => {
        if (document.body.textContent.includes('Wygenerowano manifest i włączono')) { clearInterval(timer); resolve(); }
        else if (++attempts > 50) { clearInterval(timer); reject(new Error('Generator UI did not complete')); }
      }, 100);
    })`)
    assert.equal(launcher.settings.getSettings().developerMode, true)
    assert.equal(launcher.developer.config().loader.type, 'neoforge')
    assert.equal(await evaluate(`document.getElementById('developer-mode').checked`), true)
    assert.equal(
      await evaluate(`document.body.textContent.includes('DEV · LOKALNY MANIFEST')`),
      true
    )
    await new Promise((resolve) => setTimeout(resolve, 300))
    writeFileSync(
      resolve('.smoke/developer-preview.png'),
      (await window.webContents.capturePage()).toPNG()
    )
    await evaluate(`document.querySelector('dialog').scrollTop = 10000`)
    await new Promise((resolve) => setTimeout(resolve, 300))
    writeFileSync(
      resolve('.smoke/developer-preview-bottom.png'),
      (await window.webContents.capturePage()).toPNG()
    )
    await evaluate(
      `new Promise(resolve => { document.getElementById('developer-mode').click(); setTimeout(resolve, 150); })`
    )
    assert.equal(launcher.settings.getSettings().developerMode, false)
    finish()
  })
  .catch(finish)
