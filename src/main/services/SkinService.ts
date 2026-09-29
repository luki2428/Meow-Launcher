import { z } from 'zod'

const profileSchema = z.object({
  properties: z.array(z.object({ name: z.string(), value: z.string().max(100_000) }))
})
const textureSchema = z.object({
  textures: z.object({ SKIN: z.object({ url: z.string() }).optional() })
})

export class SkinService {
  constructor(private readonly request: typeof fetch = fetch) {}

  async getSkin(uuid: string): Promise<string | null> {
    const compact = uuid.replaceAll('-', '')
    if (!/^[a-f0-9]{32}$/i.test(compact)) throw new Error('Invalid skin UUID')
    const signal = AbortSignal.timeout(15_000)
    const profile = await this.read(
      `https://sessionserver.mojang.com/session/minecraft/profile/${compact}`,
      signal
    )
    const properties = profileSchema.parse(JSON.parse(profile.toString('utf8'))).properties
    const value = properties.find((property) => property.name === 'textures')?.value
    if (!value) return null
    const skin = textureSchema.parse(JSON.parse(Buffer.from(value, 'base64').toString('utf8')))
      .textures.SKIN
    if (!skin) return null
    // Mojang can return HTTP URLs. Accept only the texture host/path and upgrade to HTTPS.
    const url = new URL(skin.url)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.hostname !== 'textures.minecraft.net' ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/texture\/[a-f0-9]{32,64}$/i.test(url.pathname)
    )
      throw new Error('Invalid skin texture URL')
    const png = await this.read(`https://textures.minecraft.net${url.pathname}`, signal)
    if (
      png.length < 24 ||
      png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
      png.readUInt32BE(16) !== 64 ||
      ![32, 64].includes(png.readUInt32BE(20))
    )
      throw new Error('Invalid skin PNG')
    return `data:image/png;base64,${png.toString('base64')}`
  }

  private async read(url: string, signal: AbortSignal): Promise<Buffer> {
    const response = await this.request(url, { signal, redirect: 'error' })
    if (!response.ok || !response.body) throw new Error('Skin download failed')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.length
        if (size > 1_048_576) throw new Error('Skin response too large')
        chunks.push(value)
      }
    } finally {
      await reader.cancel()
      reader.releaseLock()
    }
    return Buffer.concat(chunks)
  }
}
