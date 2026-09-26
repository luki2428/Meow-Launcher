import { readFile, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import log from 'electron-log/main'
import { z } from 'zod'
import { MinecraftLauncherAdapter } from '../src/main/minecraft/MinecraftLauncherAdapter'
import { GameProcessService } from '../src/main/minecraft/GameProcessService'
import { createOfflineAccount } from '../src/main/services/OfflineAccount'
import { safeError } from '../src/main/shared/LauncherError'

async function main(): Promise<void> {
  log.transports.file.level = false
  log.transports.console.level = false
  const root = resolve('.smoke/instances/main')
  const game = join(root, 'game')
  const { id: version } = z
    .object({ id: z.string() })
    .parse(JSON.parse(await readFile(join(game, 'launcher-loader.json'), 'utf8')))
  const processes = new GameProcessService()
  const account = createOfflineAccount('SmokeTest')
  let pid: number | undefined
  let error: string | undefined
  const started = Date.now()
  process.env.PATH = ''
  delete process.env.JAVA_HOME
  try {
    await new MinecraftLauncherAdapter(processes).launch(
      { accountId: account.id, instanceId: 'main', minMemoryMb: 512, maxMemoryMb: 2048 },
      { account, accessToken: '0' },
      join(root, 'runtime/java/bin/java.exe'),
      game,
      version,
      (state) => {
        pid = state.pid ?? pid
        if (state.error) error = state.error.message
      }
    )
    for (let i = 0; i < 120; i++) {
      if (error) throw new Error(error)
      const file = join(game, 'logs/latest.log')
      const fresh = await stat(file).then(
        (info) => info.mtimeMs >= started,
        () => false
      )
      const content = fresh ? await readFile(file, 'utf8').catch(() => '') : ''
      if (/Created: .*textures\/atlas/.test(content)) {
        console.log(
          'PASS: actual Minecraft process with',
          version,
          'initialized graphical texture atlases, with empty PATH; PID',
          pid
        )
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    throw new Error('Minecraft did not initialize graphics within 60 seconds')
  } finally {
    if (pid && processes.running) process.kill(pid)
  }
}
void main().catch((error) => {
  console.error(safeError(error), error instanceof Error ? error.message : '')
  process.exitCode = 1
})
