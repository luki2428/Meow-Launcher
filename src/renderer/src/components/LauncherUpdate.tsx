import { useEffect, useState } from 'react'
import type { UpdateState } from '../../../shared/update'

export function LauncherUpdate(): React.JSX.Element | null {
  const [state, setState] = useState<UpdateState | null>(null)
  useEffect(() => {
    let disposed = false
    const refresh = async (): Promise<void> => {
      try {
        const next = await window.launcher.getUpdateState()
        if (!disposed) setState(next)
      } catch {
        /* Window may be closing for installation. */
      }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 1000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [])
  if (!state || state.stage === 'disabled') return null
  return <span role="status">{state.message}</span>
}
