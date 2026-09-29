import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import {
  CommunityService,
  communityConfigSchema,
  entriesSchema
} from '../src/main/services/CommunityService'
import { pingServer, ServerStatusService, varInt } from '../src/main/services/ServerStatusService'

test('community validates data and retains last successful feeds on network failure', async (t) => {
  const original = globalThis.fetch
  t.after(() => {
    globalThis.fetch = original
  })
  let calls = 0
  globalThis.fetch = async (url) => {
    calls++
    if (String(url).endsWith('config.json')) return Response.json({ server: { host: 'localhost' } })
    return Response.json([
      { id: 'one', date: '2026-09-30', title: 'News', body: '<script>text only</script>' }
    ])
  }
  const service = new CommunityService(
    'https://raw.githubusercontent.com/owner/repo/main/launcher-config'
  )
  const first = await service.get()
  assert.equal(first.config.server?.port, 25565)
  assert.equal(first.content.news.length, 1)
  await service.get()
  assert.equal(calls, 3)
  const now = Date.now
  t.after(() => {
    Date.now = now
  })
  Date.now = () => now() + 6 * 60_000
  globalThis.fetch = async () => {
    throw new Error('Offline')
  }
  const cached = await service.get()
  assert.equal(cached.content.news[0].title, 'News')
  assert.ok(cached.content.warning)
  assert.throws(() => communityConfigSchema.parse({ server: { host: 'https://example.com' } }))
  assert.throws(() => communityConfigSchema.parse({ server: { host: 'localhost', port: 70000 } }))
  assert.throws(() => entriesSchema.parse([{ title: 'Incomplete' }]))
})

test('untrusted community source is rejected before network access', async () => {
  const result = await new CommunityService('http://example.com').get()
  assert.ok(result.content.warning)
  assert.deepEqual(result.content.news, [])
})

test('Server List Ping handles fragmented packets and pong', async (t) => {
  const server = createServer((socket) => {
    let sent = false
    socket.on('data', (data) => {
      if (sent) {
        socket.write(data)
        return
      }
      sent = true
      const json = Buffer.from(
        JSON.stringify({
          players: { online: 7, max: 30 },
          version: { name: '1.21.1' },
          description: { text: 'Hello ', extra: [{ text: '§aMeow' }] }
        })
      )
      const packet = Buffer.concat([Buffer.from([0]), varInt(json.length), json])
      const frame = Buffer.concat([varInt(packet.length), packet])
      socket.write(frame.subarray(0, 1))
      setTimeout(() => socket.write(frame.subarray(1)), 10)
    })
  })
  server.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  t.after(() => {
    server.close()
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const status = await pingServer('127.0.0.1', address.port)
  assert.equal(status.status, 'online')
  assert.equal(status.players, 7)
  assert.equal(status.message, 'Hello Meow')
  assert.equal(status.version, '1.21.1')
  assert.ok(status.ping !== undefined)
})

test('status times out and missing configuration is unknown', async (t) => {
  const server = createServer()
  server.on('connection', (socket) => {
    socket.on('data', () => {})
    socket.on('error', () => {})
  })
  server.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  t.after(() => {
    server.close()
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  await assert.rejects(pingServer('127.0.0.1', address.port, 30), /timeout/)
  assert.equal((await new ServerStatusService().get(null)).status, 'unknown')
})
