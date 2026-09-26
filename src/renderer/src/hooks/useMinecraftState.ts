import { useEffect, useState } from 'react'
import type { GameSnapshot } from '../../../shared/game'

export function useMinecraftState(): GameSnapshot {
  const [state, setState] = useState<GameSnapshot>({ state: 'idle' })
  useEffect(() => {
    let active = true
    let received = false
    const unsubscribe = window.launcher.minecraft.onProgress((next) => {
      received = true
      setState(next)
    })
    void window.launcher.minecraft
      .getState()
      .then((result) => {
        if (active && !received && result.ok) setState(result.data)
      })
      .catch(() => {
        if (active)
          setState({
            state: 'error',
            error: { code: 'IPC_FAILED', message: 'Nie można pobrać stanu gry.' }
          })
      })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])
  return state
}
