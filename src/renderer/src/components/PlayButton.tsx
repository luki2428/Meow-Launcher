import { Button } from './Button'
import style from './PlayButton.module.scss'

export function PlayButton({ message }: { message: string }): React.JSX.Element {
  return (
    <div className={style.playArea}>
      <Button className={style.playButton} disabled aria-describedby="play-message">
        GRAJ
      </Button>
      <p id="play-message" className={style.message}>
        {message}
      </p>
    </div>
  )
}
