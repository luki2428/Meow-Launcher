import type { CommunityContent } from '../../../shared/community'
import style from './Community.module.scss'

export function Community({ content }: { content?: CommunityContent }): React.JSX.Element {
  return (
    <section className={style.community} aria-label="Aktualności i changelog">
      {content?.warning && <p role="status">{content.warning}</p>}
      <div className={style.feeds}>
        {(['news', 'changelog'] as const).map((kind) => (
          <section key={kind}>
            <h2>{kind === 'news' ? 'Aktualności' : 'Changelog'}</h2>
            {!content?.[kind].length && <p>Brak opublikowanych wpisów.</p>}
            {content?.[kind].map((entry) => (
              <article key={entry.id}>
                <time dateTime={entry.date}>{entry.date}</time>
                <h3>{entry.title}</h3>
                <p>{entry.body}</p>
              </article>
            ))}
          </section>
        ))}
      </div>
    </section>
  )
}
