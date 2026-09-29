import { useCallback, useEffect, useState } from 'react'
import type { LauncherSnapshot, Result, LauncherSettings } from '../../../shared/types'

export function useLauncher(): {
  snapshot: LauncherSnapshot | null
  error: string | null
  reload: () => Promise<void>
  setRam: (ram: number) => Promise<Result<LauncherSettings>>
  updateSettings: (
    action: () => Promise<Result<LauncherSettings>>
  ) => Promise<Result<LauncherSettings>>
} {
  const [snapshot, setSnapshot] = useState<LauncherSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setSnapshot(await window.launcher.getSnapshot())
      setError(null)
    } catch {
      setError('Nie udało się pobrać danych launchera. Spróbuj ponownie.')
    }
  }, [])

  useEffect(() => {
    let active = true
    Promise.resolve()
      .then(() => window.launcher.getSnapshot())
      .then((data) => {
        if (active) setSnapshot(data)
      })
      .catch(() => {
        if (active) setError('Nie udało się pobrać danych launchera. Spróbuj ponownie.')
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let previous = ''
    return window.launcher.minecraft.onProgress((game) => {
      if (game.state !== previous) {
        previous = game.state
        void reload()
      }
    })
  }, [reload])

  useEffect(() => {
    const timer = setInterval(() => {
      void reload()
    }, 30_000)
    return () => clearInterval(timer)
  }, [reload])

  const updateSettings = async (
    action: () => Promise<Result<LauncherSettings>>
  ): Promise<Result<LauncherSettings>> => {
    try {
      const result = await action()
      if (result.ok) {
        setSnapshot((previous) =>
          previous
            ? {
                ...previous,
                settings: result.data,
                account:
                  result.data.accounts.find(
                    (account) => account.uuid === result.data.selectedAccount
                  ) ?? null,
                settingsWarning: null
              }
            : previous
        )
        await reload()
      }
      return result
    } catch {
      return {
        ok: false,
        error: { code: 'IPC_FAILED', message: 'Nie udało się połączyć z launcherem.' }
      }
    }
  }

  return {
    snapshot,
    error,
    reload,
    setRam: (ram) => updateSettings(() => window.launcher.setRam(ram)),
    updateSettings
  }
}
