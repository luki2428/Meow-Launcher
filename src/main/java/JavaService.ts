import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import log from 'electron-log/main'
import type { InstanceConfig } from '../shared/validation'
import type { LauncherProgress } from '../../shared/game'
import type { InstanceService } from '../minecraft/InstanceService'
import type { JavaRuntimeInstaller } from './JavaRuntimeInstaller'
import { LauncherError } from '../shared/LauncherError'

const execute = promisify(execFile)
export interface JavaVersion {
  majorVersion: number
  version: string
  architecture: string
}
export async function inspectJava(root: string): Promise<JavaVersion | null> {
  try {
    const { stdout, stderr } = await execute(
      join(root, 'bin', 'java.exe'),
      ['-XshowSettings:properties', '-version'],
      { timeout: 15_000, windowsHide: true, maxBuffer: 1024 * 1024 }
    )
    const output = stdout + stderr
    const version = /(?:openjdk|java) version "([^"]+)"/.exec(output)?.[1]
    const architecture = /os.arch\s*=\s*(\S+)/.exec(output)?.[1]
    if (!version || !architecture) return null
    return {
      version,
      majorVersion: Number(
        version.startsWith('1.') ? version.split('.')[1] : version.split(/[.+_-]/)[0]
      ),
      architecture
    }
  } catch {
    return null
  }
}
export class JavaService {
  constructor(
    private readonly instances: InstanceService,
    private readonly installer: Pick<JavaRuntimeInstaller, 'install'>,
    private readonly inspect = inspectJava
  ) {}
  private root(id: string): string {
    return join(this.instances.root(id), 'runtime', 'java')
  }
  getRuntimePath(id: string): string {
    return join(this.root(id), 'bin', 'java.exe')
  }
  getRuntimeVersion(id: string): Promise<JavaVersion | null> {
    return this.inspect(this.root(id))
  }
  async verifyRuntime(id: string, config?: InstanceConfig): Promise<boolean> {
    const expected = config ?? (await this.instances.load(id))
    const version = await this.getRuntimeVersion(id)
    return (
      version?.majorVersion === expected.java.majorVersion &&
      ['amd64', 'x86_64'].includes(version.architecture)
    )
  }
  async ensureRuntime(
    config: InstanceConfig,
    report: (progress: LauncherProgress) => void
  ): Promise<string> {
    if (process.platform !== 'win32' || process.arch !== config.java.architecture)
      throw new LauncherError(
        'JAVA_RUNTIME_UNSUPPORTED_PLATFORM',
        'Automatyczny runtime obsługuje obecnie Windows x64.'
      )
    await this.instances.assertNoLinks(this.getRuntimePath(config.id))
    log.info('Java: checking managed runtime')
    if (!(await this.verifyRuntime(config.id, config))) {
      await this.installer.install(
        config,
        this.root(config.id),
        async (root) => {
          const version = await this.inspect(root)
          return (
            version?.majorVersion === config.java.majorVersion &&
            ['amd64', 'x86_64'].includes(version.architecture)
          )
        },
        report
      )
    }
    if (!(await this.verifyRuntime(config.id, config)))
      throw new LauncherError('JAVA_RUNTIME_INVALID', 'Runtime Java nie przeszedł weryfikacji.')
    return this.getRuntimePath(config.id)
  }
}
