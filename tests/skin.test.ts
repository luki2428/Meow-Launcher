import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SkinService } from '../src/main/services/SkinService'

const uuid = '853c80ef-3c37-49fd-aa49-938b674adae6'
function profile(url: string): Response {
  return Response.json({
    properties: [
      {
        name: 'textures',
        value: Buffer.from(JSON.stringify({ textures: { SKIN: { url } } })).toString('base64')
      }
    ]
  })
}

test('skin lookup uses UUID and upgrades official textures to HTTPS', async () => {
  const urls: string[] = []
  const png = Buffer.alloc(24)
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png)
  png.writeUInt32BE(64, 16)
  png.writeUInt32BE(64, 20)
  const service = new SkinService(async (url, options) => {
    urls.push(String(url))
    assert.equal(options?.redirect, 'error')
    return urls.length === 1
      ? profile(`http://textures.minecraft.net/texture/${'a'.repeat(63)}`)
      : new Response(png)
  })
  assert.equal(await service.getSkin(uuid), `data:image/png;base64,${png.toString('base64')}`)
  assert.equal(
    urls[0],
    'https://sessionserver.mojang.com/session/minecraft/profile/853c80ef3c3749fdaa49938b674adae6'
  )
  assert.equal(urls[1], `https://textures.minecraft.net/texture/${'a'.repeat(63)}`)
})

test('skin lookup rejects untrusted texture hosts without fetching them', async () => {
  let calls = 0
  const service = new SkinService(async () => {
    calls++
    return profile('https://example.com/skin.png')
  })
  await assert.rejects(service.getSkin(uuid), /Invalid skin texture URL/)
  assert.equal(calls, 1)
})

test('missing skin uses fallback; invalid UUID never reaches network', async () => {
  const service = new SkinService(async () => Response.json({ properties: [] }))
  assert.equal(await service.getSkin(uuid), null)
  await assert.rejects(service.getSkin('../invalid'), /Invalid skin UUID/)
})

test('invalid image and oversized responses are rejected', async () => {
  const service = new SkinService(async (url) =>
    String(url).includes('sessionserver')
      ? profile(`https://textures.minecraft.net/texture/${'a'.repeat(63)}`)
      : new Response('not an image')
  )
  await assert.rejects(service.getSkin(uuid), /Invalid skin PNG/)
  const oversized = new SkinService(async () => new Response('x'.repeat(1_048_577)))
  await assert.rejects(oversized.getSkin(uuid), /Skin response too large/)
})
