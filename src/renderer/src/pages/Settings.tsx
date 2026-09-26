import { useState } from 'react'
import { Cpu, FolderOpen, Monitor, Check, Info, Code2 } from 'lucide-react'
import type {
  GamePreferences,
  LauncherSnapshot,
  LauncherSettings,
  Result
} from '../../../shared/types'
import { Button } from '../components/Button'
import { DeveloperSettings } from '../components/DeveloperSettings'
import { useMinecraftState } from '../hooks/useMinecraftState'
import style from './Settings.module.scss'

interface SettingsProps {
  snapshot: LauncherSnapshot
  onSave: (preferences: GamePreferences) => Promise<Result<LauncherSettings>>
  onDeveloperUpdate: (
    action: () => Promise<Result<LauncherSettings>>
  ) => Promise<Result<LauncherSettings>>
}

export function Settings({
  snapshot,
  onSave,
  onDeveloperUpdate
}: SettingsProps): React.JSX.Element {
  const [section, setSection] = useState<'performance' | 'files' | 'window' | 'developer'>(
    'performance'
  )
  const [draft, setDraft] = useState<GamePreferences>(() => ({
    ram: snapshot.settings.ram,
    installationDirectory: snapshot.settings.installationDirectory,
    windowWidth: snapshot.settings.windowWidth,
    windowHeight: snapshot.settings.windowHeight,
    fullscreen: snapshot.settings.fullscreen
  }))
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const game = useMinecraftState()
  const busy = !['idle', 'stopped', 'error'].includes(game.state)
  const dirty = (Object.keys(draft) as (keyof GamePreferences)[]).some(
    (key) => draft[key] !== snapshot.settings[key]
  )
  const directoryChanged = draft.installationDirectory !== snapshot.settings.installationDirectory
  const valid =
    Number.isInteger(draft.windowWidth) &&
    draft.windowWidth >= 854 &&
    draft.windowWidth <= 7680 &&
    Number.isInteger(draft.windowHeight) &&
    draft.windowHeight >= 480 &&
    draft.windowHeight <= 4320
  const change = (patch: Partial<GamePreferences>): void => {
    setDraft((previous) => ({ ...previous, ...patch }))
    setMessage('')
  }
  const action = async (run: () => Promise<void>): Promise<void> => {
    setPending(true)
    setMessage('')
    setFailed(false)
    try {
      await run()
    } catch {
      setFailed(true)
      setMessage('Nie udało się połączyć z launcherem. Spróbuj ponownie.')
    } finally {
      setPending(false)
    }
  }
  const save = (): Promise<void> =>
    action(async () => {
      const result = await onSave(draft)
      setFailed(!result.ok)
      setMessage(result.ok ? 'Ustawienia zapisane. Gotowe na kolejną grę.' : result.error.message)
    })
  const chooseDirectory = (): Promise<void> =>
    action(async () => {
      const result = await window.launcher.chooseInstallationDirectory()
      if (result.ok) {
        if (result.data) change({ installationDirectory: result.data })
      } else {
        setFailed(true)
        setMessage(result.error.message)
      }
    })
  const openDirectory = (): Promise<void> =>
    action(async () => {
      const result = await window.launcher.openGameDirectory()
      if (!result.ok) {
        setFailed(true)
        setMessage(result.error.message)
      }
    })

  return (
    <div className={style.settings}>
      <div className={style.intro}>
        <p>Dopasuj swój kawałek świata.</p>
        <span>MEOW / {snapshot.version}</span>
      </div>
      <nav className={style.tabs} aria-label="Kategorie ustawień">
        <button
          type="button"
          aria-pressed={section === 'performance'}
          onClick={() => setSection('performance')}
        >
          <Cpu size={16} />
          Wydajność
        </button>
        <button
          type="button"
          aria-pressed={section === 'files'}
          onClick={() => setSection('files')}
        >
          <FolderOpen size={16} />
          Pliki gry
        </button>
        <button
          type="button"
          aria-pressed={section === 'window'}
          onClick={() => setSection('window')}
        >
          <Monitor size={16} />
          Okno gry
        </button>
        <button
          type="button"
          aria-pressed={section === 'developer'}
          onClick={() => setSection('developer')}
        >
          <Code2 size={16} />
          Deweloper
        </button>
      </nav>
      {snapshot.settingsWarning && (
        <p className={style.notice} role="alert">
          {snapshot.settingsWarning}
        </p>
      )}
      {busy && (
        <p className={style.notice} role="status">
          Ustawienia możesz zmienić po zakończeniu instalacji i zamknięciu gry.
        </p>
      )}
      {section === 'developer' && (
        <>
          {dirty && (
            <p className={style.notice}>
              Najpierw zapisz zmiany pozostałych ustawień, aby zmienić tryb lub wygenerować paczkę.
            </p>
          )}
          <DeveloperSettings
            enabled={snapshot.settings.developerMode}
            installationDirectory={snapshot.settings.installationDirectory}
            disabled={pending || busy || dirty}
            updateSettings={onDeveloperUpdate}
          />
        </>
      )}
      <fieldset
        disabled={pending || busy}
        className={style.fields}
        hidden={section === 'developer'}
      >
        <section
          hidden={section !== 'performance'}
          className={style.section}
          aria-labelledby="performance-title"
        >
          <div className={style.heading}>
            <span className={style.icon}>
              <Cpu size={20} />
            </span>
            <div>
              <h3 id="performance-title">Wydajność</h3>
              <p>Więcej miejsca na Twoją przygodę.</p>
            </div>
            <span className={style.badge}>{draft.ram / 1024} GB</span>
          </div>
          <label className={style.label} htmlFor="ram">
            Pamięć dla Minecrafta <span>Maksymalny RAM</span>
          </label>
          <input
            id="ram"
            className={style.range}
            type="range"
            min={snapshot.memory.min}
            max={snapshot.memory.max}
            step={snapshot.memory.step}
            value={draft.ram}
            onChange={(event) => change({ ram: Number(event.target.value) })}
          />
          <div className={style.rangeLabels}>
            <span>{snapshot.memory.min / 1024} GB</span>
            <span>{snapshot.memory.max / 1024} GB</span>
          </div>
          <div className={style.presets}>
            {[2048, 4096, 6144, 8192]
              .filter((value) => value <= snapshot.memory.max)
              .map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={draft.ram === value}
                  onClick={() => change({ ram: value })}
                >
                  {value / 1024} GB
                </button>
              ))}
          </div>
          <p className={style.hint}>
            Limit uwzględnia pamięć komputera i zostawia co najmniej 2 GB dla systemu, jeśli to
            możliwe.
          </p>
        </section>
        <section
          hidden={section !== 'files'}
          className={style.section}
          aria-labelledby="files-title"
        >
          <div className={style.heading}>
            <span className={style.icon}>
              <FolderOpen size={20} />
            </span>
            <div>
              <h3 id="files-title">Pliki gry</h3>
              <p>Minecraft i Java w wybranym miejscu.</p>
            </div>
          </div>
          <label className={style.label} htmlFor="installation-directory">
            Miejsce instalacji
          </label>
          <div className={style.pathRow}>
            <input
              id="installation-directory"
              readOnly
              value={draft.installationDirectory}
              title={draft.installationDirectory}
            />
            <button type="button" onClick={() => void chooseDirectory()}>
              Zmień folder
            </button>
          </div>
          <p className={style.hint}>
            Pliki gry: instances / {snapshot.settings.developerMode ? 'developer' : 'main'} / game w
            wybranym folderze.
          </p>
          <button className={style.link} type="button" onClick={() => void openDirectory()}>
            <FolderOpen size={15} /> Otwórz zapisany folder gry
          </button>
          {directoryChanged && (
            <p className={style.notice}>
              <Info size={16} /> Po zapisaniu gra będzie używać nowego miejsca. Stare pliki i światy
              pozostaną w poprzednim folderze — nie przenosimy ich automatycznie. Brakujące pliki
              zostaną pobrane przy uruchomieniu.
            </p>
          )}
        </section>
        <section
          hidden={section !== 'window'}
          className={style.section}
          aria-labelledby="window-title"
        >
          <div className={style.heading}>
            <span className={style.icon}>
              <Monitor size={20} />
            </span>
            <div>
              <h3 id="window-title">Okno gry</h3>
              <p>Tak, jak lubisz grać.</p>
            </div>
          </div>
          <label className={style.toggleRow} htmlFor="fullscreen">
            <span>
              Uruchamiaj na pełnym ekranie
              <small>Zmiany obowiązują przy następnym uruchomieniu.</small>
            </span>
            <input
              id="fullscreen"
              type="checkbox"
              role="switch"
              checked={draft.fullscreen}
              onChange={(event) => change({ fullscreen: event.target.checked })}
            />
          </label>
          <div className={style.dimensions}>
            <label htmlFor="window-width">
              Szerokość <span>px</span>
              <input
                id="window-width"
                type="number"
                min={854}
                max={7680}
                disabled={draft.fullscreen}
                value={draft.windowWidth || ''}
                onChange={(event) => change({ windowWidth: Number(event.target.value) })}
              />
            </label>
            <span aria-hidden="true">×</span>
            <label htmlFor="window-height">
              Wysokość <span>px</span>
              <input
                id="window-height"
                type="number"
                min={480}
                max={4320}
                disabled={draft.fullscreen}
                value={draft.windowHeight || ''}
                onChange={(event) => change({ windowHeight: Number(event.target.value) })}
              />
            </label>
          </div>
          {!valid && (
            <p className={style.notice} role="alert">
              Podaj szerokość 854–7680 px i wysokość 480–4320 px.
            </p>
          )}
        </section>
      </fieldset>
      <footer className={style.footer} hidden={section === 'developer' && !dirty}>
        <div>
          <span className={style.saveState}>
            {dirty ? (
              'Masz niezapisane zmiany'
            ) : (
              <>
                <Check size={14} /> Wszystko zapisane
              </>
            )}
          </span>
          <small>Ustawienia tylko na tym komputerze.</small>
        </div>
        <Button disabled={pending || busy || !dirty || !valid} onClick={() => void save()}>
          {pending ? 'Proszę czekać…' : 'Zapisz zmiany'}
        </Button>
      </footer>
      {message && (
        <p role={failed ? 'alert' : 'status'} className={failed ? style.notice : style.success}>
          {message}
        </p>
      )}
    </div>
  )
}
