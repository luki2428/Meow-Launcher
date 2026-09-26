import { useEffect, useId, useRef, type ReactNode } from 'react'
import style from './Modal.module.scss'

export function Modal({
  title,
  compact = false,
  onClose,
  children
}: {
  title: string
  compact?: boolean
  onClose: () => void
  children: ReactNode
}): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current!
    const trigger = document.activeElement
    dialog.showModal()
    return () => {
      dialog.close()
      if (trigger instanceof HTMLElement) trigger.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className={`${style.dialog} ${compact ? style.compact : ''}`}
      aria-labelledby={titleId}
      onCancel={onClose}
    >
      <header className={style.header}>
        <h2 id={titleId}>{title}</h2>
        <button aria-label="Zamknij okno" onClick={onClose}>
          ×
        </button>
      </header>
      {children}
    </dialog>
  )
}
