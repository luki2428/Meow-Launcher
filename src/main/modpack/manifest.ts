import { z } from 'zod'
import { instanceSchema, versionSchema } from '../shared/validation'

// Only these directories belong to the pack. Never allow game/runtime or user data paths.
export const packPathSchema = z
  .string()
  .max(240)
  .refine((value) => {
    const parts = value.split('/')
    return (
      parts.length >= 2 &&
      ['mods', 'config', 'defaultconfigs', 'kubejs'].includes(parts[0]) &&
      parts.every(
        (part) =>
          /^[A-Za-z0-9_.+@() -]+$/.test(part) &&
          !/[. ]$/.test(part) &&
          !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)
      )
    )
  }, 'Nieprawidłowa ścieżka pliku paczki')

export const managedFileSchema = z
  .object({
    path: packPathSchema,
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .transform((value) => value.toLowerCase())
  })
  .strict()

export const manifestSchema = z
  .object({
    version: versionSchema,
    minecraft: versionSchema,
    java: instanceSchema.shape.java.optional(),
    loader: instanceSchema.shape.loader,
    files: z
      .array(
        managedFileSchema.extend({
          url: z.string().url().max(2048),
          size: z
            .number()
            .int()
            .nonnegative()
            .max(2 * 1024 ** 3)
            .optional()
        })
      )
      .max(10000)
  })
  .strict()
  .superRefine((manifest, context) => {
    const paths = new Set<string>()
    for (const file of manifest.files) {
      const path = file.path.toLowerCase()
      if (paths.has(path)) context.addIssue({ code: 'custom', message: 'Powtórzona ścieżka pliku' })
      paths.add(path)
    }
    for (const path of paths) {
      const parts = path.split('/')
      for (let i = 1; i < parts.length; i++) {
        if (paths.has(parts.slice(0, i).join('/')))
          context.addIssue({ code: 'custom', message: 'Konflikt pliku i katalogu' })
      }
    }
  })

export const packStateSchema = z
  .object({
    version: versionSchema.nullable(),
    files: z.array(managedFileSchema).max(20000),
    pending: z.array(managedFileSchema).max(20000).optional()
  })
  .strict()
export type PackManifest = z.infer<typeof manifestSchema>
export type ManagedFile = z.infer<typeof managedFileSchema>
export type PackState = z.infer<typeof packStateSchema>
