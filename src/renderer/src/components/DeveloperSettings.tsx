import { useEffect, useState } from 'react'
import { Code2, FileJson, FolderOpen } from 'lucide-react'
import { DEFAULT_DEVELOPER_PACK, type DeveloperPackInfo } from '../../../shared/developer'
import type { LauncherSettings, Result } from '../../../shared/types'
import { Button } from './Button'
import style from '../pages/Settings.module.scss'

interface DeveloperSettingsProps {
  enabled: boolean
  installationDirectory: string
  disabled: boolean
  updateSettings: (
    action: () => Promise<Result<LauncherSettings>>
  ) => Promise<Result<LauncherSettings>>
}

export function DeveloperSettings({
  enabled,
  installationDirectory,
  disabled,
  updateSettings
}: DeveloperSettingsProps): React.JSX.Element {
  const [options, setOptions] = useState(DEFAULT_DEVELOPER_PACK)
  const [info, setInfo] = useState<DeveloperPackInfo | null>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    void window.launcher
      .getDeveloperPack()
      .then((result) => {
        if (!active) return
        if (result.ok) setInfo(result.data)
        else {
          setFailed(true)
          setMessage(result.error.message)
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true)
          setMessage('Nie można odczytać informacji o paczce.')
        }
      })
    return () => {
      active = false
    }
  }, [installationDirectory])

  const run = async (
    action: () => Promise<Result<LauncherSettings>>,
    success: string
  ): Promise<void> => {
    setPending(true)
    setMessage('')
    try {
      const result = await updateSettings(action)
      setFailed(!result.ok)
      setMessage(result.ok ? success : result.error.message)
      const latest = await window.launcher.getDeveloperPack()
      if (latest.ok) setInfo(latest.data)
    } catch {
      setFailed(true)
      setMessage('Nie udało się połączyć z launcherem.')
    } finally {
      setPending(false)
    }
  }
  const open = async (): Promise<void> => {
    setPending(true)
    try {
      const result = await window.launcher.openDeveloperPackDirectory()
      if (!result.ok) {
        setFailed(true)
        setMessage(result.error.message)
      }
    } catch {
      setFailed(true)
      setMessage('Nie udało się otworzyć folderu.')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className={style.section} aria-labelledby="developer-title">
      <div className={style.heading}>
        <span className={style.icon}>
          <Code2 size={20} />
        </span>
        <div>
          <h3 id="developer-title">Lokalne środowisko testowe</h3>
          <p>Twoja paczka, bez konfiguracji z GitHuba.</p>
        </div>
      </div>
      <fieldset className={style.fields} disabled={disabled || pending}>
        <label className={style.toggleRow} htmlFor="developer-mode">
          <span>
            Tryb deweloperski<small>GRAJ używa lokalnego manifestu i osobnej instancji.</small>
          </span>
          <input
            id="developer-mode"
            role="switch"
            type="checkbox"
            checked={enabled}
            disabled={!enabled && (!info?.exists || !!info.error)}
            onChange={(event) =>
              void run(
                () => window.launcher.setDeveloperMode(event.target.checked),
                'Zmieniono tryb launchera.'
              )
            }
          />
        </label>
        <div className={style.developerMeta}>
          <span>
            Minecraft <strong>1.21.1</strong>
          </span>
          <span>
            Java <strong>21</strong>
          </span>
          <span>
            Mody <strong>0</strong>
          </span>
        </div>
        <div className={style.presets} aria-label="Loader lokalnej paczki">
          <button
            type="button"
            aria-pressed={options.loader === 'neoforge'}
            onClick={() => setOptions({ ...options, loader: 'neoforge' })}
          >
            NeoForge
          </button>
          <button
            type="button"
            aria-pressed={options.loader === 'vanilla'}
            onClick={() => setOptions({ ...options, loader: 'vanilla' })}
          >
            Vanilla
          </button>
        </div>
        {options.loader === 'neoforge' && (
          <div className={style.pathRow}>
            <label htmlFor="developer-loader">Wersja NeoForge</label>
            <input
              id="developer-loader"
              value={options.loaderVersion}
              maxLength={30}
              placeholder="21.1.172"
              onChange={(event) => setOptions({ ...options, loaderVersion: event.target.value })}
            />
          </div>
        )}
        <p className={style.hint}>
          Generator zapisuje manifest.json z pustą listą modów i od razu włącza tryb deweloperski.
          Ponowne generowanie zastępuje manifest; zachowuje światy i ręcznie dodane mody w instancji
          testowej.
        </p>
        <Button
          disabled={
            options.loader === 'neoforge' &&
            !/^21\.1\.[0-9]{1,6}(?:-beta)?$/.test(options.loaderVersion)
          }
          onClick={() =>
            void run(
              () => window.launcher.generateDeveloperPack(options),
              'Wygenerowano manifest i włączono tryb deweloperski. Możesz kliknąć GRAJ.'
            )
          }
        >
          {pending ? 'Proszę czekać…' : 'Wygeneruj i użyj lokalnej paczki'}
        </Button>
        {info && (
          <div className={style.manifest}>
            <FileJson size={16} />
            <div>
              <strong>{info.description ?? 'Manifest nie jest gotowy'}</strong>
              <code>{info.manifestPath}</code>
              <small>Folder gry: {info.gameDirectory}</small>
            </div>
          </div>
        )}
        {info?.exists && !info.error && (
          <button type="button" className={style.link} onClick={() => void open()}>
            <FolderOpen size={15} /> Otwórz folder manifestu
          </button>
        )}
      </fieldset>
      <p className={style.hint}>
        Generowanie działa bez sieci. Pierwszy start wymaga pobrania Minecrafta, NeoForge i Javy
        (także z GitHuba). Tryb nie wyłącza weryfikacji plików ani logowania kont.
      </p>
      {info?.error && (
        <p className={style.notice} role="alert">
          {info.error}
        </p>
      )}
      {message && (
        <p className={failed ? style.notice : style.success} role={failed ? 'alert' : 'status'}>
          {message}
        </p>
      )}
    </section>
  )
}
