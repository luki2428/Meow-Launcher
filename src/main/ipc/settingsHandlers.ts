import { dialog, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { join, resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { IPC } from '../../shared/ipc'
import type { LauncherService } from '../services/LauncherService'
import { LauncherError, result } from '../shared/LauncherError'
import { preferencesSchema } from '../services/GamePreferences'

export function registerSettingsHandlers(
  window: BrowserWindow,
  assertSender: (event: IpcMainInvokeEvent) => void,
  launcher: LauncherService
): void {
  let chosenDirectory: string | null = null
  ipcMain.handle(IPC.chooseInstallationDirectory, (event) => {
    assertSender(event)
    return result(async () => {
      const selection = await dialog.showOpenDialog(window, {
        title: 'Wybierz miejsce instalacji Minecrafta',
        defaultPath: launcher.settings.getSettings().installationDirectory,
        properties: ['openDirectory', 'createDirectory']
      })
      if (selection.canceled || !selection.filePaths[0]) return null
      chosenDirectory = resolve(selection.filePaths[0])
      return chosenDirectory
    })
  })
  ipcMain.handle(IPC.savePreferences, (event, input: unknown) => {
    assertSender(event)
    if (!['idle', 'stopped', 'error'].includes(launcher.minecraft.getState().state))
      return {
        ok: false,
        error: {
          code: 'GAME_BUSY',
          message: 'Zamknij grę i poczekaj na zakończenie instalacji przed zmianą ustawień.'
        }
      }
    const parsed = preferencesSchema.safeParse(input)
    if (!parsed.success)
      return {
        ok: false,
        error: { code: 'INVALID_SETTINGS', message: 'Sprawdź wartości ustawień.' }
      }
    if (
      parsed.data.installationDirectory !== launcher.settings.getSettings().installationDirectory &&
      parsed.data.installationDirectory !== chosenDirectory
    )
      return {
        ok: false,
        error: { code: 'INVALID_DIRECTORY', message: 'Wybierz folder przyciskiem Zmień folder.' }
      }
    return launcher.settings.savePreferences(parsed.data)
  })
  ipcMain.handle(IPC.openGameDirectory, (event) => {
    assertSender(event)
    return result(async () => {
      const path = join(
        launcher.settings.getSettings().installationDirectory,
        'instances',
        launcher.developer.enabled ? 'developer' : 'main',
        'game'
      )
      await mkdir(path, { recursive: true })
      if (await shell.openPath(path))
        throw new LauncherError('OPEN_DIRECTORY_FAILED', 'Nie udało się otworzyć folderu gry.')
    })
  })
}
