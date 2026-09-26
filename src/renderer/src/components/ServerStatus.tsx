import type { LauncherSnapshot } from '../../../shared/types'
import { Card } from './Card'
import style from './ServerStatus.module.scss'

export function ServerStatus({
  server
}: {
  server: LauncherSnapshot['server']
}): React.JSX.Element {
  return (
    <Card eyebrow="SERWER">
      <h2>Nieznany status</h2>
      <p>{server.message}</p>
      <span className={style.players}>Gracze online: —</span>
    </Card>
  )
}
