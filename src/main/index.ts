import { app, BrowserWindow, dialog } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createWindow } from './windows/createWindow'
import { createLauncher } from './services/createLauncher'
import log from 'electron-log/main'

const primary = app.requestSingleInstanceLock()
if (!primary) app.quit()

void app
  .whenReady()
  .then(() => {
    if (!primary) return
    log.initialize({ preload: false })
    log.info('Launcher: start', app.getVersion())
    electronApp.setAppUserModelId('pl.meow.launcher')
    const launcher = createLauncher()
    const active = (): boolean =>
      !['idle', 'stopped', 'error'].includes(launcher.minecraft.getState().state)
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin' && !active()) app.quit()
    })
    launcher.minecraft.events.on('state', () => {
      if (process.platform !== 'darwin' && BrowserWindow.getAllWindows().length === 0 && !active())
        app.quit()
    })
    app.on('second-instance', () => {
      const window = BrowserWindow.getAllWindows()[0] ?? createWindow(launcher)
      if (window?.isMinimized()) window.restore()
      window?.show()
      window?.focus()
    })
    app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
    createWindow(launcher)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(launcher)
    })
  })
  .catch((error: unknown) => {
    log.error('Launcher: startup failed', error instanceof Error ? error.name : 'UnknownError')
    dialog.showErrorBox(
      'Błąd uruchamiania',
      'Nie udało się uruchomić launchera. Sprawdź logi aplikacji.'
    )
    app.exit(1)
  })
