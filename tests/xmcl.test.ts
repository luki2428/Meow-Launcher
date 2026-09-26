import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DownloadTask } from '@xmcl/installer'
import { runXmclTask } from '../src/main/minecraft/XmclTaskRunner'
import { join, resolve } from 'node:path'
import { task } from '@xmcl/task'

test('retry waits for sibling writes after an early dependency failure', async () => {
  const game = resolve('out/tests/download-fixture')
  let attempt = 0
  let writing = false
  class Failing extends DownloadTask {
    protected async process(): Promise<void> {
      if (attempt === 1) throw new Error('Transient')
    }
  }
  class Slow extends DownloadTask {
    protected async process(): Promise<void> {
      writing = true
      await new Promise((resolve) => setTimeout(resolve, 20))
      writing = false
    }
  }
  await runXmclTask(
    () => {
      assert.equal(writing, false)
      attempt++
      return task('dependencies', async function () {
        await Promise.all([
          this.yield(
            new Failing({
              destination: join(game, 'first.jar'),
              url: 'https://libraries.minecraft.net/first.jar'
            })
          ),
          this.yield(
            new Slow({
              destination: join(game, 'second.jar'),
              url: 'https://libraries.minecraft.net/second.jar'
            })
          )
        ])
      })
    },
    game,
    'minecraft',
    () => {}
  )
  assert.equal(attempt, 2)
})

test('version-pinned XMCL adapter injects pending files before downloads and retries failures', async () => {
  const game = resolve('out/tests/download-fixture')
  let attempts = 0
  class Probe extends DownloadTask {
    protected async process(): Promise<void> {
      assert.equal(this.options.pendingFile, join(game, 'client.jar.tmp'))
      if (++attempts < 2) throw new Error('Transient network failure')
    }
  }
  await runXmclTask(
    () =>
      new Probe({
        destination: join(game, 'client.jar'),
        url: 'https://piston-data.mojang.com/client.jar'
      }),
    game,
    'minecraft',
    () => {}
  )
  assert.equal(attempts, 2)
})
test('XMCL adapter rejects HTTP and destinations outside the game directory before download', async () => {
  const game = resolve('out/tests/download-fixture')
  let processed = false
  class Probe extends DownloadTask {
    protected async process(): Promise<void> {
      processed = true
    }
  }
  for (const options of [
    { destination: join(game, 'client.jar'), url: 'http://piston-data.mojang.com/client.jar' },
    {
      destination: resolve(game, '../escape.jar'),
      url: 'https://piston-data.mojang.com/client.jar'
    }
  ])
    await assert.rejects(
      runXmclTask(
        () => new Probe(options),
        game,
        'minecraft',
        () => {}
      )
    )
  assert.equal(processed, false)
})
