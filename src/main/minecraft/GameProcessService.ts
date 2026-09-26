import type { ChildProcess } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import log from 'electron-log/main'
import type { GameSnapshot } from '../../shared/game'

// Buffer complete lines so a token split across stdout chunks cannot escape redaction.
export function redactLine(line: string, secrets: string[]): string {
  let safe = line
  for (const secret of secrets) if (secret.length > 1) safe = safe.split(secret).join('[REDACTED]')
  return safe.replace(
    /(Bearer\s+|(?:access[_-]?token|refresh[_-]?token|authorization|client[_-]?secret|password)\s*[:=]\s*)\S+/gi,
    '$1[REDACTED]'
  )
}
export class GameProcessService {
  private child?: ChildProcess
  get running(): boolean {
    return this.child !== undefined
  }
  monitor(child: ChildProcess, secrets: string[], update: (snapshot: GameSnapshot) => void): void {
    this.child = child
    let finished = false
    const finish = (snapshot: GameSnapshot): void => {
      if (finished) return
      finished = true
      this.child = undefined
      update(snapshot)
    }
    for (const stream of [child.stdout, child.stderr]) {
      const decoder = new StringDecoder('utf8')
      let pending = ''
      let dropping = false
      stream?.on('data', (chunk: Buffer) => {
        pending += decoder.write(chunk)
        let end: number
        while ((end = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, end)
          if (!dropping && line.length <= 65536) log.info('[Minecraft]', redactLine(line, secrets))
          pending = pending.slice(end + 1)
          dropping = false
        }
        if (pending.length > 65536) {
          pending = ''
          dropping = true
        }
      })
      stream?.on('end', () => {
        pending += decoder.end()
        if (pending && !dropping) log.info('[Minecraft]', redactLine(pending, secrets))
      })
    }
    child.once('error', () =>
      finish({
        state: 'error',
        error: {
          code: 'MINECRAFT_LAUNCH_FAILED',
          message: 'Nie udało się uruchomić procesu Minecraft.'
        }
      })
    )
    child.once('close', (code, signal) => {
      log.info('Minecraft: exit', code, signal)
      finish(
        code === 0
          ? { state: 'stopped', exitCode: code }
          : {
              state: 'error',
              exitCode: code,
              error: {
                code: 'MINECRAFT_CRASH',
                message: `Minecraft zakończył działanie ${code === null ? 'sygnałem ' + signal : 'z kodem ' + code}. Sprawdź logi gry.`
              }
            }
      )
    })
    if (child.pid) {
      log.info('Minecraft: PID', child.pid)
      update({
        state: 'running',
        pid: child.pid,
        progress: { stage: 'running', message: 'Minecraft jest uruchomiony.' }
      })
    }
  }
}
