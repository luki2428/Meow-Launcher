import { Settings2, Play, Box } from 'lucide-react'
import type { LauncherSnapshot } from '../../../shared/types'
import style from './Home.module.scss'
import { useState } from 'react'
import { useMinecraftState } from '../hooks/useMinecraftState'

export function Home({
  snapshot,
  onSettings
}: {
  snapshot: LauncherSnapshot
  onSettings: () => void
}): React.JSX.Element {
  const game = useMinecraftState()
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState('')
  const busy = requesting || !['idle', 'stopped', 'error'].includes(game.state)
  const play = async (): Promise<void> => {
    if (!snapshot.account) return
    setRequesting(true)
    setError('')
    try {
      const result = await window.launcher.minecraft.launch({
        instanceId: 'main',
        accountId: snapshot.account.id,
        minMemoryMb: Math.min(2048, snapshot.settings.ram),
        maxMemoryMb: snapshot.settings.ram
      })
      if (!result.ok) setError(result.error.message)
    } catch {
      setError('Nie można połączyć się z launcherem.')
    } finally {
      setRequesting(false)
    }
  }
  return (
    <>
      <section className={style.info} aria-label="Informacje o serwerze i paczce">
        <div>
          <span>SERWER</span>
          <strong
            title={[
              snapshot.server.message,
              snapshot.server.version,
              snapshot.server.ping !== undefined ? snapshot.server.ping + ' ms' : ''
            ]
              .filter(Boolean)
              .join(' · ')}
          >
            <i />
            {snapshot.server.status === 'online'
              ? 'Online'
              : snapshot.server.status === 'offline'
                ? 'Offline'
                : 'Status nieznany'}
          </strong>
        </div>
        <div>
          <span>GRACZE ONLINE</span>
          <strong>
            {snapshot.server.players ?? '—'} <small>/ {snapshot.server.maxPlayers ?? '—'}</small>
          </strong>
        </div>
        <div>
          <span>EDYCJA</span>
          <strong className={style.purple}>
            {snapshot.settings.developerMode ? 'Deweloper' : 'Wkrótce'}
          </strong>
        </div>
        <div>
          <span>WERSJA PACZKI</span>
          <strong>{snapshot.modpackVersion ?? 'Nie zainstalowano'}</strong>
        </div>
      </section>
      <section className={style.hero}>
        <div className={style.art} aria-hidden="true">
          <div className={style.moon} />
          <div className={style.mountainBack} />
          <div className={style.mountainFront} />
          <div className={style.ground} />
        </div>
        <div className={style.heroContent}>
          <span className={style.badge}>
            {snapshot.settings.developerMode ? 'TRYB DEWELOPERSKI' : 'MEOW SERWER'}
          </span>
          {snapshot.settings.developerMode ? (
            <>
              <h1>
                Tryb <em>testowy.</em>
              </h1>
              <p>Lokalny manifest, osobny folder gry.</p>
            </>
          ) : (
            <>
              <h1>
                Wbijaj na <em>serwer.</em>
              </h1>
              <p>Kliknij GRAJ, resztę zrobi launcher.</p>
            </>
          )}
        </div>
        <div className={style.heroFooter}>
          <span className={style.dot} />
          <span>{snapshot.edition.name}</span>
          {snapshot.settings.developerMode && (
            <span className={style.coming}>OSOBNA INSTANCJA</span>
          )}
        </div>
      </section>
      <section className={style.actionBar} aria-label="Uruchamianie gry">
        <div className={style.launchInfo}>
          <span className={style.packIcon} aria-hidden="true">
            <Box size={22} />
          </span>
          <div className={style.launchDetails}>
            <h2>{snapshot.settings.developerMode ? 'Minecraft' : 'Meow Modpack'}</h2>
            <span className={style.packMeta}>
              {snapshot.settings.developerMode ? 'Lokalna paczka' : 'Oficjalna paczka'} ·{' '}
              {snapshot.account?.username ?? 'Nie wybrano konta'}
            </span>
            <p id="play-message" role="status">
              {error ||
                game.error?.message ||
                (busy
                  ? game.progress?.message || 'Przygotowywanie gry…'
                  : !snapshot.account
                    ? 'Zaloguj się, aby rozpocząć.'
                    : snapshot.edition.playEnabled
                      ? (game.progress?.message ?? 'Gotowy do gry')
                      : snapshot.edition.message)}
            </p>
            {busy && game.progress?.bytesPerSecond !== undefined && (
              <span>{(game.progress.bytesPerSecond / 1024 ** 2).toFixed(1)} MB/s</span>
            )}
            {game.progress?.progress !== undefined && busy && (
              <div className={style.progressRow}>
                <progress
                  className={style.progress}
                  max={100}
                  value={game.progress.progress}
                  aria-label="Postęp przygotowania gry"
                  aria-describedby="play-message"
                />
                <span className={style.progressValue} aria-hidden="true">
                  {Math.round(game.progress.progress)}%
                </span>
              </div>
            )}
          </div>
        </div>
        <div className={style.actions}>
          {[
            'preparing',
            'updating-modpack',
            'installing-java',
            'installing-minecraft',
            'installing-loader'
          ].includes(game.state) && (
            <button
              className={`${style.settings} ${style.cancel}`}
              onClick={() => {
                void window.launcher.minecraft
                  .cancelInstallation()
                  .then((result) => {
                    if (!result.ok) setError(result.error.message)
                  })
                  .catch(() => setError('Nie udało się anulować aktualizacji.'))
              }}
            >
              Anuluj
            </button>
          )}
          <button
            className={style.settings}
            onClick={onSettings}
            aria-haspopup="dialog"
            aria-label="Ustawienia"
            title="Ustawienia"
          >
            <Settings2 size={18} aria-hidden="true" />
          </button>
          <button
            className={style.play}
            disabled={busy || !snapshot.account || !snapshot.edition.playEnabled}
            onClick={() => void play()}
            aria-describedby="play-message"
          >
            <Play size={18} fill="currentColor" aria-hidden="true" />{' '}
            {busy ? (game.state === 'running' ? 'W GRZE' : 'PRZYGOTOWANIE…') : 'GRAJ'}
          </button>
        </div>
      </section>
    </>
  )
}
