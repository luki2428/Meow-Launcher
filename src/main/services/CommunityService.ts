import { z } from 'zod'
import { fetchJson, trustedUrl } from '../shared/network'
import type { CommunityContent } from '../../shared/community'
import { serverAddressSchema } from './ServerStatusService'

const hosts = ['raw.githubusercontent.com']
export const communityConfigSchema = z.object({
  server: serverAddressSchema.nullable().default(null)
})
export const entriesSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(100),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      title: z.string().min(1).max(200),
      body: z.string().min(1).max(10000)
    })
  )
  .max(100)

export class CommunityService {
  private config: z.infer<typeof communityConfigSchema> = { server: null }
  private content: CommunityContent = { news: [], changelog: [], warning: null }
  private nextRefresh = 0
  private pending?: Promise<void>
  constructor(private readonly baseUrl: string) {}

  async get(): Promise<{
    config: z.infer<typeof communityConfigSchema>
    content: CommunityContent
  }> {
    if (!this.pending && Date.now() >= this.nextRefresh) {
      this.pending = this.refresh().finally(() => {
        this.pending = undefined
      })
    }
    await this.pending
    return structuredClone({ config: this.config, content: this.content })
  }

  private async refresh(): Promise<void> {
    this.nextRefresh = Date.now() + 5 * 60_000
    const results = await Promise.allSettled(
      ['config', 'news', 'changelog'].map(async (name) => {
        const url = trustedUrl(`${this.baseUrl.replace(/\/$/, '')}/${name}.json`, hosts)
        const data = await fetchJson(url.href, hosts, AbortSignal.timeout(5000))
        if (name === 'config') this.config = communityConfigSchema.parse(data)
        else
          this.content[name as 'news' | 'changelog'] = entriesSchema
            .parse(data)
            .sort((a, b) => b.date.localeCompare(a.date))
      })
    )
    this.content.warning = results.some((r) => r.status === 'rejected')
      ? 'Nie udało się odświeżyć wszystkich informacji. Pokazujemy ostatnio pobrane treści, jeśli są dostępne.'
      : null
  }
}
