import { ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '../../shared/ipc'
import { LauncherError, result } from '../shared/LauncherError'
import type { LauncherService } from '../services/LauncherService'

export function registerDeveloperHandlers(
  assertSender: (event: IpcMainInvokeEvent) => void,
  launcher: LauncherService
): void {
  const assertIdle = (): void => {
    if (!['idle', 'stopped', 'error'].includes(launcher.minecraft.getState().state))
      throw new LauncherError(
        'GAME_BUSY',
        'Zamknij grę i poczekaj na zakończenie instalacji przed zmianą trybu lub paczki.'
      )
  }
  const setMode = (enabled: boolean): ReturnType<typeof launcher.settings.getSettings> => {
    if (enabled) launcher.developer.read()
    const saved = launcher.settings.setDeveloperMode(enabled)
    if (!saved.ok) throw new LauncherError(saved.error.code, saved.error.message)
    return saved.data
  }
  ipcMain.handle(IPC.getDeveloperPack, (event) => {
    assertSender(event)
    return result(() => launcher.developer.info())
  })
  ipcMain.handle(IPC.generateDeveloperPack, (event, options: unknown) => {
    assertSender(event)
    return result(() => {
      assertIdle()
      launcher.developer.generate(options)
      return setMode(true)
    })
  })
  ipcMain.handle(IPC.setDeveloperMode, (event, enabled: unknown) => {
    assertSender(event)
    return result(() => {
      assertIdle()
      if (typeof enabled !== 'boolean')
        throw new LauncherError('INVALID_INPUT', 'Nieprawidłowy tryb.')
      return setMode(enabled)
    })
  })
  ipcMain.handle(IPC.openDeveloperPackDirectory, (event) => {
    assertSender(event)
    return result(async () => {
      launcher.developer.read()
      if (await shell.openPath(launcher.developer.directory))
        throw new LauncherError(
          'OPEN_DIRECTORY_FAILED',
          'Nie udało się otworzyć folderu manifestu.'
        )
    })
  })
}
