import type { ButtonHTMLAttributes } from 'react'
import style from './Button.module.scss'

export function Button({
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  return (
    <button
      type={type}
      className={[style.button, className].filter(Boolean).join(' ')}
      {...props}
    />
  )
}
