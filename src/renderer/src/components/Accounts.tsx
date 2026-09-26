import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, UserRound } from 'lucide-react'
import type { LauncherSettings, Result } from '../../../shared/types'
import { Button } from './Button'
import style from './Accounts.module.scss'

interface AccountsProps {
  settings: LauncherSettings
  warning: string | null
  onComplete: () => void
  updateSettings: (
    action: () => Promise<Result<LauncherSettings>>
  ) => Promise<Result<LauncherSettings>>
}
export function Accounts({
  settings,
  warning,
  updateSettings,
  onComplete
}: AccountsProps): React.JSX.Element {
  const selected = settings.accounts.find((account) => account.uuid === settings.selectedAccount)
  const [step, setStep] = useState<'choose' | 'offline'>('choose')
  const [username, setUsername] = useState(selected?.type === 'offline' ? selected.username : '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (step === 'offline') input.current?.focus()
  }, [step])

  const run = async (action: () => Promise<Result<LauncherSettings>>): Promise<void> => {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      const result = await updateSettings(action)
      if (result.ok) onComplete()
      else setMessage(result.error.message)
    } catch {
      setMessage('Nie udało się połączyć z launcherem. Spróbuj ponownie.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={style.content} aria-busy={busy}>
      {warning && <p role="alert">{warning}</p>}
      {step === 'choose' ? (
        <>
          <p className={style.description}>Wybierz, jak chcesz dołączyć do gry.</p>
          <div className={style.choices}>
            <button
              className={style.choice}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await window.launcher.auth.loginMicrosoft()
                  if (!result.ok) return result
                  return { ok: true, data: (await window.launcher.getSnapshot()).settings }
                })
              }
            >
              <span className={style.microsoftIcon} aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </span>
              <span>
                <strong>Zaloguj przez Microsoft</strong>
                <small>Mam Minecraft Java Edition</small>
              </span>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            <button
              className={style.choice}
              disabled={busy}
              onClick={() => {
                setMessage('')
                setStep('offline')
              }}
            >
              <span className={style.offlineIcon}>
                <UserRound size={22} aria-hidden="true" />
              </span>
              <span>
                <strong>Kontynuuj jako nonpremium</strong>
                <small>Wystarczy Twój nick</small>
              </span>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>
          {busy && (
            <p role="status" className={style.hint}>
              Dokończ logowanie w przeglądarce…
            </p>
          )}
        </>
      ) : (
        <>
          <button
            className={style.back}
            disabled={busy}
            onClick={() => {
              setStep('choose')
              setMessage('')
            }}
          >
            <ArrowLeft size={16} aria-hidden="true" /> Wróć do wyboru
          </button>
          <p className={style.description}>Podaj nick, z którym wejdziesz do świata Minecraft.</p>
          <form
            className={style.form}
            onSubmit={(event) => {
              event.preventDefault()
              const existing = settings.accounts.find(
                (account) => account.type === 'offline' && account.username === username
              )
              void run(() =>
                existing
                  ? window.launcher.selectAccount(existing.uuid)
                  : window.launcher.saveOfflineAccount(username)
              )
            }}
          >
            <label htmlFor="nickname">Twój nick</label>
            <input
              ref={input}
              id="nickname"
              value={username}
              disabled={busy}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="np. MeowPlayer"
              minLength={3}
              maxLength={16}
              pattern="[A-Za-z0-9_]{3,16}"
              required
              autoComplete="off"
              spellCheck={false}
              aria-describedby="nickname-help"
            />
            <p id="nickname-help" className={style.hint}>
              3–16 znaków: litery A–Z, cyfry i podkreślenie.
            </p>
            <Button type="submit" disabled={busy}>
              {busy ? 'Zapisywanie…' : 'Zapisz'}
            </Button>
          </form>
          <p className={style.hint}>
            Tryb nonpremium działa na serwerach, które pozwalają na grę bez konta Microsoft.
          </p>
        </>
      )}
      {message && (
        <p className={style.error} role="alert">
          {message}
        </p>
      )}
    </div>
  )
}
