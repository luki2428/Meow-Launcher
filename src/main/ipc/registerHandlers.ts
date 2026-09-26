import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '../../shared/ipc'
import type { LauncherService } from '../services/LauncherService'
import { isRendererUrl } from './isRendererUrl'
import { registerServiceHandlers } from './serviceHandlers'
import { result } from '../shared/LauncherError'
import { z } from 'zod'
import { registerSettingsHandlers } from './settingsHandlers'
import { registerDeveloperHandlers } from './developerHandlers'

export function registerHandlers(
  window: BrowserWindow,
  rendererUrl: string,
  launcher: LauncherService
): void {
  const assertSender = (event: IpcMainInvokeEvent): void => {
    if (
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      !isRendererUrl(event.senderFrame.url, rendererUrl)
    ) {
      throw new Error('Niedozwolony nadawca IPC.')
    }
  }

  ipcMain.handle(IPC.getSnapshot, (event) => {
    assertSender(event)
    return launcher.getSnapshot()
  })
  ipcMain.handle(IPC.setRam, (event, ram: unknown) => {
    assertSender(event)
    return launcher.settings.setRam(ram)
  })
  ipcMain.handle(IPC.saveOfflineAccount, (event, username: unknown, previousUuid: unknown) => {
    assertSender(event)
    return launcher.settings.saveOfflineAccount(username, previousUuid)
  })
  ipcMain.handle(IPC.selectAccount, (event, uuid: unknown) => {
    assertSender(event)
    return launcher.settings.selectAccount(uuid)
  })
  ipcMain.handle(IPC.removeAccount, (event, uuid: unknown) => {
    assertSender(event)
    return result(async () => {
      await launcher.auth.logout(z.string().min(1).max(100).parse(uuid))
      return launcher.settings.getSettings()
    })
  })
  registerServiceHandlers(window, assertSender, launcher)
  registerSettingsHandlers(window, assertSender, launcher)
  registerDeveloperHandlers(assertSender, launcher)
  window.on('closed', () => Object.values(IPC).forEach((channel) => ipcMain.removeHandler(channel)))
}
