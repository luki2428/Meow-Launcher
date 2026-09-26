import { AuthError, ServerError } from '@azure/msal-node'
import { MicrosoftMinecraftXboxLoginError } from '@xmcl/user'
import { ZodError } from 'zod'
import { LauncherError } from '../shared/LauncherError'

export type MicrosoftAuthStage = 'oauth' | 'xbox' | 'minecraft' | 'profile'

export class MicrosoftStageError extends Error {
  constructor(
    readonly stage: MicrosoftAuthStage,
    cause: unknown
  ) {
    super(`Microsoft auth stage failed: ${stage}`, { cause })
  }
}

export async function inStage<T>(stage: MicrosoftAuthStage, action: () => Promise<T>): Promise<T> {
  try {
    return await action()
  } catch (error) {
    if (error instanceof LauncherError || error instanceof MicrosoftStageError) throw error
    throw new MicrosoftStageError(stage, error)
  }
}

const xstsErrors: Record<number, [string, string]> = {
  2148916227: ['MICROSOFT_XBOX_BANNED', 'Konto Xbox zostało zablokowane.'],
  2148916229: [
    'MICROSOFT_CHILD_ACCOUNT',
    'Konto dziecka nie ma zgody na grę online. Rodzic musi ją nadać w ustawieniach rodziny Microsoft.'
  ],
  2148916233: [
    'MICROSOFT_NO_XBOX_ACCOUNT',
    'To konto Microsoft nie ma profilu Xbox. Zaloguj się raz na xbox.com, aby go utworzyć.'
  ],
  2148916235: [
    'MICROSOFT_XBOX_REGION',
    'Xbox Live nie jest dostępny w kraju przypisanym do tego konta.'
  ],
  2148916236: ['MICROSOFT_AGE_VERIFICATION', 'Konto wymaga weryfikacji wieku na xbox.com.'],
  2148916237: ['MICROSOFT_AGE_VERIFICATION', 'Konto wymaga weryfikacji wieku na xbox.com.'],
  2148916238: [
    'MICROSOFT_CHILD_ACCOUNT',
    'Konto osoby niepełnoletniej musi zostać dodane do rodziny Microsoft przez osobę dorosłą.'
  ]
}

const genericFailure = (): LauncherError =>
  new LauncherError(
    'MICROSOFT_LOGIN_FAILED',
    'Logowanie Microsoft nie powiodło się. Sprawdź połączenie i spróbuj ponownie.'
  )
const misconfigured = (): LauncherError =>
  new LauncherError(
    'MICROSOFT_APP_MISCONFIGURED',
    'Aplikacja Microsoft launchera jest nieprawidłowo skonfigurowana. Szczegóły w logu launchera.'
  )

function describe(error: unknown): string {
  const parts: string[] = []
  if (error instanceof Error) parts.push(error.name)
  if (error instanceof AuthError) {
    parts.push(error.errorCode)
    if (error instanceof ServerError && error.errorNo) parts.push(`AADSTS${error.errorNo}`)
  }
  if (error instanceof MicrosoftMinecraftXboxLoginError) {
    parts.push(`status ${error.status}`)
    if (/invalid app registration/i.test(error.body)) parts.push('invalid app registration')
  }
  if (error instanceof ZodError)
    parts.push(`invalid response: ${error.issues.map((issue) => issue.path.join('.')).join(', ')}`)
  if (error && typeof error === 'object') {
    if ('XErr' in error && typeof error.XErr === 'number') parts.push(`XErr ${error.XErr}`)
    if (
      error instanceof Error &&
      !(error instanceof AuthError) &&
      !(error instanceof MicrosoftMinecraftXboxLoginError)
    ) {
      const status = /status code: (\d{3})/.exec(error.message)?.[1]
      if (status) parts.push(`status ${status}`)
    }
    const cause = 'cause' in error ? error.cause : undefined
    if (cause && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string')
      parts.push(cause.code)
  }
  return parts.join(', ') || 'unknown'
}

export function classifyMicrosoftError(error: unknown): {
  error: LauncherError
  diagnostic: string
} {
  if (error instanceof LauncherError) return { error, diagnostic: error.code }
  const stage = error instanceof MicrosoftStageError ? error.stage : 'oauth'
  const cause = error instanceof MicrosoftStageError ? error.cause : error
  const diagnostic = `${stage}: ${describe(cause)}`

  if (cause instanceof Error && cause.name === 'TimeoutError')
    return {
      diagnostic,
      error: new LauncherError(
        'MICROSOFT_TIMEOUT',
        'Usługi Microsoft / Xbox nie odpowiedziały na czas. Spróbuj ponownie.'
      )
    }
  if (stage === 'oauth' && cause instanceof AuthError) {
    if (/^(invalid_client|unauthorized_client|invalid_request)$/.test(cause.errorCode))
      return { diagnostic, error: misconfigured() }
    return { diagnostic, error: genericFailure() }
  }
  if (stage === 'xbox' && cause && typeof cause === 'object' && 'XErr' in cause) {
    const known = typeof cause.XErr === 'number' ? xstsErrors[cause.XErr] : undefined
    if (known) return { diagnostic, error: new LauncherError(known[0], known[1]) }
  }
  if (stage === 'minecraft' && cause instanceof MicrosoftMinecraftXboxLoginError) {
    if (cause.status === 403 && /invalid app registration/i.test(cause.body))
      return {
        diagnostic,
        error: new LauncherError(
          'MICROSOFT_APP_NOT_APPROVED',
          'Aplikacja Microsoft launchera nie ma jeszcze dostępu do Minecraft API. Jej identyfikator musi zostać zatwierdzony przez Mojang.'
        )
      }
    if (cause.status === 429)
      return {
        diagnostic,
        error: new LauncherError(
          'MICROSOFT_RATE_LIMITED',
          'Zbyt wiele prób logowania. Spróbuj ponownie za kilka minut.'
        )
      }
  }
  return { diagnostic, error: genericFailure() }
}
