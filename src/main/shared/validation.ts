import { z } from 'zod'
import { resolve, sep } from 'node:path'
import { LauncherError } from './LauncherError'

export const usernameSchema = z.string().regex(/^[A-Za-z0-9_]{3,16}$/)
export const accountSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(['offline', 'microsoft']),
  username: usernameSchema,
  uuid: z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)
})
export const versionSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.+-]{0,99}$/)
  .refine((v) => !v.includes('..'))
export const instanceSchema = z
  .object({
    id: z.literal('main'),
    minecraft: versionSchema,
    java: z
      .object({ majorVersion: z.number().int().min(8).max(99), architecture: z.literal('x64') })
      .strict(),
    loader: z.discriminatedUnion('type', [
      z.object({ type: z.literal('vanilla') }).strict(),
      z.object({ type: z.enum(['fabric', 'forge', 'neoforge']), version: versionSchema }).strict()
    ]),
    playEnabled: z.boolean().default(true),
    modpack: z
      .object({
        manifestUrl: z.string().url().max(2048),
        allowedHosts: z
          .array(z.string().regex(/^[a-z0-9.-]+$/))
          .min(1)
          .max(32)
      })
      .strict()
      .optional()
  })
  .strict()
export type InstanceConfig = z.infer<typeof instanceSchema>
export const launchSchema = z
  .object({
    accountId: z.string().min(1).max(100),
    instanceId: z.literal('main'),
    minMemoryMb: z.number().int().min(512),
    maxMemoryMb: z.number().int().min(1024),
    serverAddress: z
      .string()
      .regex(/^[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/)
      .max(260)
      .optional()
  })
  .strict()
  .refine((v) => v.minMemoryMb <= v.maxMemoryMb)

export function inside(root: string, relative: string): string {
  if (
    relative.includes('\\') ||
    relative.includes(':') ||
    relative.startsWith('/') ||
    relative.split('/').some((p) => p === '..' || /[. ]$/.test(p))
  ) {
    throw new LauncherError('INVALID_PATH', 'Nieprawidłowa ścieżka pliku.')
  }
  const path = resolve(root, relative)
  if (!path.startsWith(resolve(root) + sep))
    throw new LauncherError('INVALID_PATH', 'Nieprawidłowa ścieżka pliku.')
  return path
}
