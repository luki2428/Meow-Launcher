import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { InstanceService } from '../minecraft/InstanceService'
import { inside } from '../shared/validation'
import { LauncherError } from '../shared/LauncherError'
import { packStateSchema, type PackState } from './manifest'

export class ModpackStore {
  constructor(private readonly instances: InstanceService) {}

  async checked(path: string): Promise<string> {
    await this.instances.assertNoLinks(path)
    return path
  }

  async target(relative: string): Promise<string> {
    return this.checked(inside(this.instances.game('main'), relative))
  }

  async hash(path: string): Promise<string | null> {
    await this.checked(path)
    try {
      if (!(await lstat(path)).isFile())
        throw new LauncherError('MODPACK_PATH_CONFLICT', 'Plik paczki koliduje z katalogiem.')
      const hash = createHash('sha256')
      for await (const chunk of createReadStream(path)) hash.update(chunk)
      return hash.digest('hex')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  async read(): Promise<PackState> {
    const path = await this.checked(join(this.instances.root('main'), 'modpack-state.json'))
    try {
      if ((await lstat(path)).size > 8 * 1024 * 1024) throw new Error('State too large')
      return packStateSchema.parse(JSON.parse(await readFile(path, 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: null, files: [] }
      throw new LauncherError(
        'MODPACK_STATE_INVALID',
        'Nie można odczytać stanu paczki. Przywróć plik modpack-state.json z kopii zapasowej.',
        error
      )
    }
  }

  async write(state: PackState): Promise<void> {
    const path = await this.checked(join(this.instances.root('main'), 'modpack-state.json'))
    const temporary = await this.checked(path + '.tmp')
    await writeFile(temporary, JSON.stringify(state, null, 2) + '\n')
    await rename(temporary, path)
  }
}
