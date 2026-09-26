import { useEffect, useRef, useState } from 'react'
import { Button } from './components/Button'
import { Modal } from './components/Modal'
import { Accounts } from './components/Accounts'
import { useLauncher } from './hooks/useLauncher'
import { Home } from './pages/Home'
import { Settings } from './pages/Settings'
import style from './App.module.scss'

function App(): React.JSX.Element {
  const { snapshot, error, reload, updateSettings } = useLauncher()
  const [modal, setModal] = useState<'settings' | 'accounts' | null>(null)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const accountMenu = useRef<HTMLDivElement>(null)
  const accountTrigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!accountMenuOpen) return
    const closeOutside = (event: PointerEvent): void => {
      if (event.target instanceof Node && !accountMenu.current?.contains(event.target)) {
        setAccountMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [accountMenuOpen])
  return (
    <div className={style.appShell}>
      <header className={style.header}>
        <div className={style.brand}>
          <span className={style.logo} aria-hidden="true">
            m.
          </span>
          <span>
            meow<span className={style.brandSub}>MINECRAFT LAUNCHER</span>
          </span>
        </div>
        <div
          className={style.accountMenu}
          ref={accountMenu}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setAccountMenuOpen(false)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && accountMenuOpen) {
              event.preventDefault()
              setAccountMenuOpen(false)
              accountTrigger.current?.focus()
            }
          }}
        >
          <button
            ref={accountTrigger}
            className={style.account}
            onClick={() =>
              snapshot?.account ? setAccountMenuOpen((open) => !open) : setModal('accounts')
            }
            disabled={!snapshot}
            aria-haspopup={snapshot?.account ? undefined : 'dialog'}
            aria-expanded={snapshot?.account ? accountMenuOpen : undefined}
            aria-controls={snapshot?.account && accountMenuOpen ? 'account-options' : undefined}
          >
            <span className={style.avatar}>
              {snapshot?.account?.username.slice(0, 2).toUpperCase() ?? '?'}
            </span>
            <span>
              <strong>{snapshot?.account?.username ?? 'Wybierz konto'}</strong>
              <small>
                {snapshot?.account
                  ? snapshot.account.type === 'microsoft'
                    ? 'Konto Microsoft'
                    : 'Nonpremium'
                  : 'Twoja przygoda, Twój nick'}
              </small>
            </span>
            <span aria-hidden="true">⌄</span>
          </button>
          {snapshot?.account && accountMenuOpen && (
            <div className={style.accountDropdown} id="account-options">
              <button
                aria-haspopup="dialog"
                onClick={() => {
                  setAccountMenuOpen(false)
                  accountTrigger.current?.focus()
                  setModal('accounts')
                }}
              >
                Zmień konto
              </button>
            </div>
          )}
        </div>
      </header>
      <main className={style.main}>
        {error ? (
          <section role="alert">
            <h1>Nie udało się wczytać launchera</h1>
            <p>{error}</p>
            <Button onClick={() => void reload()}>Spróbuj ponownie</Button>
          </section>
        ) : !snapshot ? (
          <p role="status">Wczytywanie launchera…</p>
        ) : (
          <Home snapshot={snapshot} onSettings={() => setModal('settings')} />
        )}
      </main>
      <footer className={style.footer}>
        <span>MEOW LAUNCHER / {snapshot?.version ?? '…'}</span>
      </footer>
      {modal && snapshot && (
        <Modal
          title={modal === 'settings' ? 'Ustawienia' : 'Dołącz do gry'}
          compact={modal === 'accounts'}
          onClose={() => setModal(null)}
        >
          {modal === 'settings' ? (
            <Settings
              snapshot={snapshot}
              onDeveloperUpdate={async (action) => {
                const result = await updateSettings(action)
                if (result.ok) await reload()
                return result
              }}
              onSave={(preferences) =>
                updateSettings(() => window.launcher.savePreferences(preferences))
              }
            />
          ) : (
            <Accounts
              settings={snapshot.settings}
              warning={snapshot.settingsWarning}
              updateSettings={updateSettings}
              onComplete={() => setModal(null)}
            />
          )}
        </Modal>
      )}
    </div>
  )
}
export default App
