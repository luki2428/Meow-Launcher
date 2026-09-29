import { ipcMain, type IpcMainInvokeEvent, type BrowserWindow } from 'electron'
import { z } from 'zod'
import { IPC } from '../../shared/ipc'
import { LauncherError, result } from '../shared/LauncherError'
import { launchSchema, usernameSchema } from '../shared/validation'
import type { LauncherService } from '../services/LauncherService'
import type { GameSnapshot } from '../../shared/game'
import { SkinService } from '../services/SkinService'

export function registerServiceHandlers(
  window: BrowserWindow,
  assertSender: (event: IpcMainInvokeEvent) => void,
  launcher: LauncherService
): void {
  const id = z.string().min(1).max(100)
  const skins = new SkinService()
  const handle = (channel: string, action: (...args: unknown[]) => unknown): void => {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      assertSender(event)
      return result(() => action(...args))
    })
  }
  handle(IPC.authSkin, (...args) => {
    const [value] = z.tuple([id]).parse(args)
    const account = launcher.auth.accounts.getAccounts().find((entry) => entry.id === value)
    return account?.type === 'microsoft' ? skins.getSkin(account.uuid) : null
  })
  handle(IPC.authLoginMicrosoft, (...args) => {
    z.tuple([]).parse(args)
    return launcher.auth.loginMicrosoft()
  })
  handle(IPC.authLoginOffline, (...args) => {
    const [name] = z.tuple([usernameSchema]).parse(args)
    return launcher.auth.loginOffline(name)
  })
  handle(IPC.authLogout, (...args) => {
    const [value] = z.tuple([id]).parse(args)
    return launcher.auth.logout(value)
  })
  handle(IPC.authAccounts, (...args) => {
    z.tuple([]).parse(args)
    return launcher.auth.accounts.getAccounts()
  })
  handle(IPC.authSelected, (...args) => {
    z.tuple([]).parse(args)
    return launcher.auth.accounts.getSelectedAccount()
  })
  handle(IPC.authSelect, (...args) => {
    const [value] = z.tuple([id]).parse(args)
    return launcher.auth.accounts.selectAccount(value)
  })
  handle(IPC.minecraftLaunch, (...args) => {
    const [options] = z.tuple([launchSchema]).parse(args)
    if (launcher.updater?.getState().stage === 'installing') {
      throw new LauncherError('LAUNCHER_UPDATING', 'Trwa restart launchera po aktualizacji.')
    }
    return launcher.minecraft.launch(options)
  })
  handle(IPC.minecraftState, (...args) => {
    z.tuple([]).parse(args)
    return launcher.minecraft.getState()
  })
  handle(IPC.minecraftCancelInstallation, (...args) => {
    z.tuple([]).parse(args)
    return launcher.minecraft.cancelInstallation()
  })
  handle(IPC.minecraftCancelModpack, (...args) => {
    z.tuple([]).parse(args)
    return launcher.minecraft.cancelModpackUpdate()
  })
  const onState = (state: GameSnapshot): void => {
    if (!window.isDestroyed()) window.webContents.send(IPC.minecraftProgress, state)
  }
  launcher.minecraft.events.on('state', onState)
  window.once('closed', () => launcher.minecraft.events.off('state', onState))
}
