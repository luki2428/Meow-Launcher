import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { LauncherAPI } from '../shared/types'

const launcher: LauncherAPI = {
  auth: {
    loginMicrosoft: () => ipcRenderer.invoke(IPC.authLoginMicrosoft),
    loginOffline: (username) => ipcRenderer.invoke(IPC.authLoginOffline, username),
    logout: (id) => ipcRenderer.invoke(IPC.authLogout, id),
    getAccounts: () => ipcRenderer.invoke(IPC.authAccounts),
    getSelectedAccount: () => ipcRenderer.invoke(IPC.authSelected),
    selectAccount: (id) => ipcRenderer.invoke(IPC.authSelect, id)
  },
  minecraft: {
    launch: (options) => ipcRenderer.invoke(IPC.minecraftLaunch, options),
    getState: () => ipcRenderer.invoke(IPC.minecraftState),
    cancelModpackUpdate: () => ipcRenderer.invoke(IPC.minecraftCancelModpack),
    onProgress: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        state: import('../shared/game').GameSnapshot
      ): void => callback(state)
      ipcRenderer.on(IPC.minecraftProgress, listener)
      return () => ipcRenderer.removeListener(IPC.minecraftProgress, listener)
    }
  },
  getSnapshot: () => ipcRenderer.invoke(IPC.getSnapshot),
  setRam: (ram) => ipcRenderer.invoke(IPC.setRam, ram),
  savePreferences: (preferences) => ipcRenderer.invoke(IPC.savePreferences, preferences),
  chooseInstallationDirectory: () => ipcRenderer.invoke(IPC.chooseInstallationDirectory),
  openGameDirectory: () => ipcRenderer.invoke(IPC.openGameDirectory),
  getDeveloperPack: () => ipcRenderer.invoke(IPC.getDeveloperPack),
  generateDeveloperPack: (options) => ipcRenderer.invoke(IPC.generateDeveloperPack, options),
  setDeveloperMode: (enabled) => ipcRenderer.invoke(IPC.setDeveloperMode, enabled),
  openDeveloperPackDirectory: () => ipcRenderer.invoke(IPC.openDeveloperPackDirectory),
  saveOfflineAccount: (username, previousUuid) =>
    ipcRenderer.invoke(IPC.saveOfflineAccount, username, previousUuid),
  selectAccount: (uuid) => ipcRenderer.invoke(IPC.selectAccount, uuid),
  removeAccount: (uuid) => ipcRenderer.invoke(IPC.removeAccount, uuid)
}

contextBridge.exposeInMainWorld('launcher', launcher)
