import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-node'
import { MicrosoftAuthenticator, MojangClient, ProfileNotFoundError } from '@xmcl/user'
import { shell } from 'electron'
import log from 'electron-log/main'
import { z } from 'zod'
import type { MicrosoftAccount } from '../../shared/types'
import { LauncherError } from '../shared/LauncherError'
import { usernameSchema } from '../shared/validation'
import type { AccountStore } from './AccountStore'
import { classifyMicrosoftError, inStage, MicrosoftStageError } from './microsoftErrors'

type OAuthResult = Pick<
  Awaited<ReturnType<PublicClientApplication['acquireTokenInteractive']>>,
  'accessToken' | 'account'
>
export interface OAuthClient {
  acquireTokenInteractive(
    request: Parameters<PublicClientApplication['acquireTokenInteractive']>[0]
  ): Promise<OAuthResult>
  acquireTokenSilent(
    request: Parameters<PublicClientApplication['acquireTokenSilent']>[0]
  ): Promise<OAuthResult>
  getTokenCache(): Pick<
    ReturnType<PublicClientApplication['getTokenCache']>,
    'serialize' | 'deserialize' | 'getAccountByHomeId'
  >
}
interface MicrosoftDependencies {
  createClient?: () => OAuthClient
  exchange?: (token: string) => Promise<MinecraftSession>
}

const scopes = ['XboxLive.signin', 'offline_access']
const persistedSchema = z.object({
  cache: z.string(),
  homeAccountId: z.string(),
  clientId: z.string()
})
export interface MinecraftSession {
  account: MicrosoftAccount
  accessToken: string
}

export class MicrosoftAuthService {
  constructor(
    private readonly store: AccountStore,
    private readonly clientId: string,
    private readonly dependencies: MicrosoftDependencies = {}
  ) {}

  private client(): OAuthClient {
    if (!z.uuid().safeParse(this.clientId).success)
      throw new LauncherError(
        'MICROSOFT_CLIENT_ID_MISSING',
        'Ustaw prawidłowy MICROSOFT_CLIENT_ID w konfiguracji launchera.'
      )
    this.store.assertEncryption()
    if (this.dependencies.createClient) return this.dependencies.createClient()
    return new PublicClientApplication({
      auth: { clientId: this.clientId, authority: 'https://login.microsoftonline.com/consumers' },
      system: { loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => {} } }
    })
  }

  async login(): Promise<MicrosoftAccount> {
    log.info('Microsoft auth: start')
    try {
      const client = this.client()
      const token = await client.acquireTokenInteractive({
        scopes,
        prompt: 'select_account',
        openBrowser: async (url) => {
          const parsed = new URL(url)
          if (parsed.protocol !== 'https:' || parsed.hostname !== 'login.microsoftonline.com')
            throw new Error('Invalid OAuth URL')
          await shell.openExternal(url)
        },
        successTemplate: resultPage('Logowanie zakończone. Wróć do Meow Launcher.'),
        errorTemplate: resultPage('Nie udało się zalogować. Wróć do Meow Launcher.')
      })
      if (!token.account) throw new MicrosoftStageError('oauth', new Error('Missing account'))
      const session = await this.exchange(token.accessToken)
      this.store.saveMicrosoftAccount(
        session.account,
        JSON.stringify({
          cache: client.getTokenCache().serialize(),
          homeAccountId: token.account.homeAccountId,
          clientId: this.clientId
        })
      )
      log.info('Microsoft auth: success')
      return session.account
    } catch (error) {
      const failure = classifyMicrosoftError(error)
      log.warn(`Microsoft auth: failed (${failure.diagnostic})`)
      throw failure.error
    }
  }

  async refresh(account: MicrosoftAccount): Promise<MinecraftSession> {
    try {
      const client = this.client()
      const saved = persistedSchema.parse(JSON.parse(this.store.readSession(account.id)))
      if (saved.clientId !== this.clientId)
        throw new InteractionRequiredAuthError('client_changed', 'Login required')
      client.getTokenCache().deserialize(saved.cache)
      const identity = await client.getTokenCache().getAccountByHomeId(saved.homeAccountId)
      if (!identity) throw new InteractionRequiredAuthError('missing_account', 'Login required')
      const token = await client.acquireTokenSilent({ account: identity, scopes })
      // Persist rotated refresh tokens before a subsequent network operation can fail.
      this.store.writeSession(
        account.id,
        JSON.stringify({ ...saved, cache: client.getTokenCache().serialize() })
      )
      const session = await this.exchange(token.accessToken)
      if (session.account.id !== account.id)
        throw new LauncherError(
          'MICROSOFT_SESSION_EXPIRED',
          'Profil sesji nie odpowiada wybranemu kontu. Zaloguj się ponownie.'
        )
      log.info('Microsoft auth: session refreshed')
      return session
    } catch (error) {
      if (error instanceof LauncherError) throw error
      if (error instanceof InteractionRequiredAuthError)
        throw new LauncherError(
          'MICROSOFT_SESSION_EXPIRED',
          'Sesja Microsoft wygasła. Zaloguj się ponownie.'
        )
      const failure = classifyMicrosoftError(error)
      log.warn(`Microsoft auth: refresh failed (${failure.diagnostic})`)
      if (failure.error.code !== 'MICROSOFT_LOGIN_FAILED') throw failure.error
      throw new LauncherError(
        'MICROSOFT_REFRESH_FAILED',
        'Nie udało się odświeżyć sesji Microsoft. Sprawdź połączenie lub zaloguj się ponownie.'
      )
    }
  }

  private async exchange(accessToken: string): Promise<MinecraftSession> {
    if (this.dependencies.exchange) return this.dependencies.exchange(accessToken)
    const auth = new MicrosoftAuthenticator()
    const signal = AbortSignal.timeout(90_000)
    const xsts = await inStage('xbox', async () =>
      z
        .object({
          Token: z.string().min(1),
          DisplayClaims: z.object({ xui: z.array(z.object({ uhs: z.string().min(1) })).min(1) })
        })
        .parse((await auth.acquireXBoxToken(accessToken, signal)).minecraftXstsResponse)
    )
    const token = await inStage('minecraft', async () =>
      z
        .object({ access_token: z.string().min(1), expires_in: z.number().positive() })
        .parse(await auth.loginMinecraftWithXBox(xsts.DisplayClaims.xui[0].uhs, xsts.Token, signal))
    )
    // The authenticated Java profile endpoint is authoritative for Java access (including Game Pass).
    const profile = await inStage('profile', async () => {
      try {
        return z
          .object({ id: z.string().regex(/^[a-f0-9]{32}$/i), name: usernameSchema })
          .parse(await new MojangClient().getProfile(token.access_token, signal))
      } catch (error) {
        if (error instanceof ProfileNotFoundError)
          throw new LauncherError(
            'MINECRAFT_PROFILE_NOT_FOUND',
            'Konto nie ma profilu Minecraft Java. Sprawdź zakup gry i utwórz profil na minecraft.net.'
          )
        throw error
      }
    })
    const uuid = profile.id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')
    return {
      account: { id: uuid, uuid, type: 'microsoft', username: profile.name },
      accessToken: token.access_token
    }
  }
}

function resultPage(message: string): string {
  // The MSAL loopback server does not send a charset, so declare it in the document.
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Meow Launcher</title></head><body style="font-family:system-ui,sans-serif;background:#1c1b22;color:#eee;display:grid;place-items:center;height:100vh;margin:0"><p>${message}</p></body></html>`
}
