import { createConnection, isIP } from 'node:net'
import { z } from 'zod'
import type { ServerStatus } from '../../shared/community'

export const serverAddressSchema = z.object({
  host: z
    .string()
    .min(1)
    .max(253)
    .refine(
      (host) =>
        isIP(host) !== 0 ||
        host.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
    ),
  port: z.number().int().min(1).max(65535).default(25565)
})
export function varInt(value: number): Buffer {
  const bytes: number[] = []
  do {
    let byte = value & 127
    value >>>= 7
    if (value) byte |= 128
    bytes.push(byte)
  } while (value)
  return Buffer.from(bytes)
}
function readVarInt(data: Buffer, offset = 0): { value: number; end: number } | null {
  let value = 0
  for (let i = 0; i < 5; i++) {
    if (offset + i >= data.length) return null
    const byte = data[offset + i]
    value |= (byte & 127) << (7 * i)
    if (!(byte & 128)) return { value, end: offset + i + 1 }
  }
  throw new Error('Invalid VarInt')
}
const responseSchema = z.object({
  players: z.object({
    online: z.number().int().nonnegative(),
    max: z.number().int().nonnegative()
  }),
  version: z.object({ name: z.string().max(200) }),
  description: z.unknown()
})
function motd(value: unknown, depth = 0): string {
  if (depth > 10) return ''
  if (typeof value === 'string') return value.slice(0, 2000)
  if (Array.isArray(value))
    return value
      .map((v) => motd(v, depth + 1))
      .join('')
      .slice(0, 2000)
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>
    return (motd(v.text, depth + 1) + motd(v.extra, depth + 1)).slice(0, 2000)
  }
  return ''
}
export function pingServer(host: string, port: number, timeout = 5000): Promise<ServerStatus> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port })
    let buffer: Buffer = Buffer.alloc(0)
    let status: ServerStatus | undefined
    let pingStarted = 0
    const payload = Buffer.alloc(8)
    const finish = (error?: Error): void => {
      clearTimeout(timer)
      socket.destroy()
      if (error) reject(error)
      else if (status) resolve(status)
    }
    const timer = setTimeout(() => finish(new Error('Status timeout')), timeout)
    socket.on('error', finish)
    socket.on('end', () => finish(new Error('Connection ended')))
    socket.on('connect', () => {
      const address = Buffer.from(host)
      const portBytes = Buffer.alloc(2)
      portBytes.writeUInt16BE(port)
      const handshake = Buffer.concat([
        Buffer.from([0]),
        varInt(-1),
        varInt(address.length),
        address,
        portBytes,
        Buffer.from([1])
      ])
      socket.write(Buffer.concat([varInt(handshake.length), handshake, Buffer.from([1, 0])]))
    })
    socket.on('data', (chunk: Buffer) => {
      try {
        if (buffer.length + chunk.length > 1024 * 1024) throw new Error('Status too large')
        buffer = Buffer.concat([buffer, chunk])
        while (buffer.length) {
          const length = readVarInt(buffer)
          if (!length) return
          if (length.value < 1 || length.value > 1024 * 1024)
            throw new Error('Invalid packet length')
          if (buffer.length < length.end + length.value) return
          const packet = buffer.subarray(length.end, length.end + length.value)
          buffer = buffer.subarray(length.end + length.value)
          if (!status) {
            if (packet[0] !== 0) throw new Error('Invalid status packet')
            const size = readVarInt(packet, 1)
            if (!size || size.value < 0 || size.end + size.value !== packet.length)
              throw new Error('Invalid JSON length')
            const data = responseSchema.parse(
              JSON.parse(packet.subarray(size.end).toString('utf8'))
            )
            status = {
              status: 'online',
              players: data.players.online,
              maxPlayers: data.players.max,
              version: data.version.name,
              message: motd(data.description).replace(/§./g, '')
            }
            pingStarted = Date.now()
            payload.writeBigInt64BE(BigInt(pingStarted))
            socket.write(Buffer.concat([Buffer.from([9, 1]), payload]))
          } else {
            if (packet.length !== 9 || packet[0] !== 1 || !packet.subarray(1).equals(payload))
              throw new Error('Invalid pong')
            status.ping = Date.now() - pingStarted
            finish()
            return
          }
        }
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Invalid status'))
      }
    })
  })
}
export class ServerStatusService {
  private cached?: { key: string; until: number; value: Promise<ServerStatus> }
  get(address: z.infer<typeof serverAddressSchema> | null): Promise<ServerStatus> {
    if (!address)
      return Promise.resolve({
        status: 'unknown',
        message: 'Adres serwera nie został jeszcze skonfigurowany.'
      })
    const key = JSON.stringify(address)
    if (this.cached?.key === key && Date.now() < this.cached.until) return this.cached.value
    const value = pingServer(address.host, address.port).catch((): ServerStatus => ({
      status: 'offline',
      message: 'Nie można połączyć się z serwerem.'
    }))
    this.cached = { key, until: Date.now() + 30_000, value }
    return value
  }
}
