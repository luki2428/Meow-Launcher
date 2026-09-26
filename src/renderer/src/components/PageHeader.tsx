import style from './PageHeader.module.scss'

interface PageHeaderProps {
  eyebrow: string
  title: string
  description: string
}

export function PageHeader({ eyebrow, title, description }: PageHeaderProps): React.JSX.Element {
  return (
    <header className={style.header}>
      <p className={style.eyebrow}>{eyebrow}</p>
      <h1 className={style.title}>{title}</h1>
      <p>{description}</p>
    </header>
  )
}
