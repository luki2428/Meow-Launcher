import { DownloadTask, DownloadMultipleTask } from '@xmcl/installer'
import type { DownloadOptions } from '@xmcl/file-transfer'
import { TaskGroup, type Task } from '@xmcl/task'
import { lstatSync } from 'node:fs'
import { basename, relative, resolve, sep, join } from 'node:path'
import { inside } from '../shared/validation'
import { trustedUrl } from '../shared/network'
import type { LauncherProgress } from '../../shared/game'

const hosts = [
  'piston-meta.mojang.com',
  'launchermeta.mojang.com',
  'piston-data.mojang.com',
  'launcher.mojang.com',
  'resources.download.minecraft.net',
  'libraries.minecraft.net',
  'maven.minecraftforge.net',
  'maven.neoforged.net',
  'maven.fabricmc.net',
  'repo1.maven.org',
  'repo.maven.apache.org'
]
function prepare(options: DownloadOptions, game: string): void {
  const destination = inside(game, relative(game, options.destination).split(sep).join('/'))
  let path = resolve(game)
  for (const part of relative(game, destination).split(sep)) {
    path = join(path, part)
    try {
      if (lstatSync(path).isSymbolicLink()) throw new Error('Download target is a link')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  const urls = typeof options.url === 'string' ? [options.url] : options.url
  for (const url of urls) trustedUrl(url, hosts)
  options.pendingFile = destination + '.tmp'
  try {
    if (lstatSync(options.pendingFile).isSymbolicLink()) throw new Error('Pending target is a link')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}
class SingleDownload extends DownloadTask {
  static prepare(task: DownloadTask, game: string): void {
    prepare((task as SingleDownload).options, game)
  }
}
class MultipleDownload extends DownloadMultipleTask {
  static prepare(task: DownloadMultipleTask, game: string): void {
    for (const options of (task as MultipleDownload).options) prepare(options, game)
  }
}
export async function runXmclTask<T>(
  factory: () => Task<T>,
  game: string,
  stage: LauncherProgress['stage'],
  report: (progress: LauncherProgress) => void,
  signal?: AbortSignal
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted()
    const task = factory()
    const children = new Set<Task<unknown>>()
    const completions = new Map<Task<unknown>, { promise: Promise<void>; done: () => void }>()
    const cancelled = new Set<Task<unknown>>()
    const cancel = (): void => {
      for (const child of children) {
        // Groups propagate cancellation themselves; cancel leaves once to avoid
        // overwriting XMCL's abort completion callback with a second cancel.
        if (child instanceof TaskGroup || cancelled.has(child)) continue
        cancelled.add(child)
        void child.cancel().catch(() => {})
      }
    }
    signal?.addEventListener('abort', cancel, { once: true })
    let timedOut = false
    let last = 0
    const timeout = setTimeout(() => {
      timedOut = true
      cancel()
    }, 20 * 60_000)
    try {
      return await task.startAndWait({
        onStart: (child) => {
          signal?.throwIfAborted()
          if (timedOut) throw new Error('Installation timed out')
          if (child instanceof DownloadTask) SingleDownload.prepare(child, game)
          if (child instanceof DownloadMultipleTask) MultipleDownload.prepare(child, game)
          children.add(child)
          let done!: () => void
          const promise = new Promise<void>((resolve) => {
            done = resolve
          })
          completions.set(child, { promise, done })
        },
        onSucceed: (child) => completions.get(child)?.done(),
        onFailed: (child) => completions.get(child)?.done(),
        onUpdate: (child) => {
          if (Date.now() - last < 150) return
          last = Date.now()
          report({
            stage,
            message:
              stage === 'loader'
                ? 'Instalowanie loadera…'
                : 'Sprawdzanie i pobieranie plików Minecraft…',
            progress:
              child.total > 0
                ? Math.min(100, Math.max(0, Math.floor((child.progress / child.total) * 100)))
                : undefined,
            currentFile: child.to ? basename(child.to) : undefined
          })
        }
      })
    } catch (error) {
      await Promise.allSettled([...completions.values()].map((entry) => entry.promise))
      signal?.throwIfAborted()
      if (attempt === 2 || timedOut || task.isCancelled) throw error
    } finally {
      signal?.removeEventListener('abort', cancel)
      clearTimeout(timeout)
    }
  }
}
