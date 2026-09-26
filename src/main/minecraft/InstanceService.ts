import { mkdir, readFile, writeFile, lstat } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { instanceSchema, type InstanceConfig } from '../shared/validation'
import { LauncherError } from '../shared/LauncherError'

export class InstanceService {
  constructor(
    private readonly directorySource: string | (() => string),
    private readonly localSource?: { readonly enabled: boolean; config(): InstanceConfig }
  ) {}
  private get directory(): string {
    return typeof this.directorySource === 'string' ? this.directorySource : this.directorySource()
  }
  root(id: string): string {
    if (id !== 'main') throw new LauncherError('INVALID_INSTANCE', 'Nieznana instancja gry.')
    return join(this.directory, 'instances', this.localSource?.enabled ? 'developer' : id)
  }
  game(id: string): string {
    return join(this.root(id), 'game')
  }
  async load(id: string): Promise<InstanceConfig> {
    const localConfig = this.localSource?.enabled ? this.localSource.config() : undefined
    const root = this.root(id)
    await this.assertNoLinks(join(root, 'instance.json'))
    await this.assertNoLinks(this.game(id))
    await mkdir(root, { recursive: true })
    const file = join(root, 'instance.json')
    if (!localConfig)
      try {
        await writeFile(
          file,
          JSON.stringify(
            {
              id,
              minecraft: '1.21.1',
              java: { majorVersion: 21, architecture: 'x64' },
              loader: { type: 'vanilla' },
              playEnabled: true
            },
            null,
            2
          ),
          { flag: 'wx' }
        )
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
    const config = localConfig ?? instanceSchema.parse(JSON.parse(await readFile(file, 'utf8')))
    await mkdir(this.game(id), { recursive: true })
    for (const managed of [
      'versions',
      'libraries',
      'assets',
      'launcher-loader.json',
      'launcher-loader.json.tmp'
    ])
      await this.assertNoLinks(join(this.game(id), managed))
    return config
  }
  async assertNoLinks(path: string): Promise<void> {
    const root = resolve(this.directory)
    const target = resolve(path)
    if (!target.startsWith(root + sep)) throw new Error('Invalid instance path')
    let current = root
    for (const segment of target.slice(root.length + 1).split(sep)) {
      current = join(current, segment)
      try {
        if ((await lstat(current)).isSymbolicLink())
          throw new LauncherError('INVALID_PATH', 'Katalog instancji nie może być dowiązaniem.')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
  }
}
