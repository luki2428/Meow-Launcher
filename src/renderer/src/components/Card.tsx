import type { HTMLAttributes } from 'react'
import style from './Card.module.scss'

interface CardProps extends HTMLAttributes<HTMLElement> {
  eyebrow?: string
}

export function Card({ eyebrow, className, children, ...props }: CardProps): React.JSX.Element {
  return (
    <section className={[style.card, className].filter(Boolean).join(' ')} {...props}>
      {eyebrow && <p className={style.eyebrow}>{eyebrow}</p>}
      {children}
    </section>
  )
}
