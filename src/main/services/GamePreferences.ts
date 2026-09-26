import { isAbsolute, resolve, parse } from 'node:path'
import { z } from 'zod'

export const preferencesSchema = z
  .object({
    ram: z.number().int(),
    installationDirectory: z
      .string()
      .min(1)
      .max(4096)
      .refine(
        (path) =>
          isAbsolute(path) &&
          !Array.from(path).some((character) => character.charCodeAt(0) < 32) &&
          resolve(path) !== parse(path).root
      ),
    windowWidth: z.number().int().min(854).max(7680),
    windowHeight: z.number().int().min(480).max(4320),
    fullscreen: z.boolean()
  })
  .strict()
