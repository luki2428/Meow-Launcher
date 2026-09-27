import { createHash } from 'node:crypto'
import { open, rename, rm } from 'node:fs/promises'
import { LauncherError } from './LauncherError'

export function trustedUrl(value: string, hosts: readonly string[]): URL {
  const url = new URL(value)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !hosts.includes(url.hostname)
  )
    throw new LauncherError('INVALID_URL', 'Źródło pobierania nie jest zaufane.')
  return url
}
export async function trustedFetch(
  value: string,
  hosts: readonly string[],
  signal: AbortSignal
): Promise<Response> {
  let url = trustedUrl(value, hosts)
  for (let redirects = 0; redirects < 6; redirects++) {
    const response = await fetch(url, { redirect: 'manual', signal })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel()
      url = trustedUrl(new URL(response.headers.get('location') ?? '', url).href, hosts)
      continue
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new LauncherError(
        'DOWNLOAD_FAILED',
        `Źródło pobierania zwróciło HTTP ${response.status}.`
      )
    }
    return response
  }
  throw new LauncherError('DOWNLOAD_FAILED', 'Zbyt wiele przekierowań pobierania.')
}
export async function fetchJson(
  url: string,
  hosts: readonly string[],
  signal?: AbortSignal
): Promise<unknown> {
  const response = await trustedFetch(
    url,
    hosts,
    AbortSignal.any([AbortSignal.timeout(30_000), ...(signal ? [signal] : [])])
  )
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of response.body!) {
    size += chunk.length
    if (size > 8 * 1024 * 1024) throw new Error('Metadata too large')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}
export async function downloadVerified(
  url: string,
  hosts: readonly string[],
  destination: string,
  checksum: string,
  size: number | undefined,
  progress: (percent: number, bytesPerSecond: number) => void,
  signal?: AbortSignal
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      signal?.throwIfAborted()
      const response = await trustedFetch(
        url,
        hosts,
        AbortSignal.any([AbortSignal.timeout(600_000), ...(signal ? [signal] : [])])
      )
      const file = await open(destination + '.tmp', 'w')
      try {
        const hash = createHash('sha256')
        let received = 0
        const started = Date.now()
        for await (const chunk of response.body!) {
          received += chunk.length
          signal?.throwIfAborted()
          if (received > (size ?? 2 * 1024 ** 3)) throw new Error('Download exceeds expected size')
          hash.update(chunk)
          await file.writeFile(chunk)
          progress(
            size ? Math.floor((received / size) * 100) : 0,
            Math.round(received / Math.max(0.001, (Date.now() - started) / 1000))
          )
        }
        if (
          (size !== undefined && received !== size) ||
          hash.digest('hex') !== checksum.toLowerCase()
        )
          throw new LauncherError(
            'CHECKSUM_MISMATCH',
            'Pobrany plik ma niepoprawną sumę SHA-256 lub rozmiar.'
          )
      } finally {
        await file.close()
      }
      await rename(destination + '.tmp', destination)
      return
    } catch (error) {
      await rm(destination + '.tmp', { force: true })
      signal?.throwIfAborted()
      if (attempt === 2) throw error
    }
  }
}
