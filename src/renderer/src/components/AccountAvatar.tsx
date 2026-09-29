import { useEffect, useState } from 'react'
import type { LauncherAccount } from '../../../shared/types'
import steveHead from '../assets/steve-head.svg'
import style from './AccountAvatar.module.scss'

export function AccountAvatar({ account }: { account: LauncherAccount | null }): React.JSX.Element {
  const [head, setHead] = useState<string | null>(null)
  const accountId = account?.id
  const accountType = account?.type

  useEffect(() => {
    let cancelled = false
    if (accountType !== 'microsoft' || !accountId) return
    void window.launcher.auth
      .getSkin(accountId)
      .then((result) => {
        if (cancelled || !result.ok || !result.data) return
        const image = new Image()
        image.onload = () => {
          if (cancelled || image.width !== 64 || ![32, 64].includes(image.height)) return
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = 64
          const context = canvas.getContext('2d')
          if (!context) return
          context.imageSmoothingEnabled = false
          context.drawImage(image, 8, 8, 8, 8, 0, 0, 64, 64)
          context.drawImage(image, 40, 8, 8, 8, 0, 0, 64, 64)
          setHead(canvas.toDataURL('image/png'))
        }
        image.src = result.data
      })
      .catch(() => {
        // Keep the local Steve head when the network is unavailable.
      })
    return () => {
      cancelled = true
    }
  }, [accountId, accountType])

  return (
    <span className={style.avatar} aria-hidden="true">
      {account ? <img src={head ?? steveHead} alt="" width={35} height={35} /> : '?'}
    </span>
  )
}
