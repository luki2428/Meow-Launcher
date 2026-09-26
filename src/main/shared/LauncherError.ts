import { ZodError } from 'zod'
import type { Result } from '../../shared/types'

export class LauncherError extends Error {
  constructor(
    readonly code: string,
    readonly userMessage: string,
    cause?: unknown
  ) {
    super(userMessage, { cause })
  }
}
export function safeError(error: unknown): { code: string; message: string } {
  if (error instanceof LauncherError) return { code: error.code, message: error.userMessage }
  if (error instanceof ZodError)
    return { code: 'INVALID_INPUT', message: 'Nieprawidłowe dane lub konfiguracja.' }
  return {
    code: 'OPERATION_FAILED',
    message: 'Operacja nie powiodła się. Sprawdź połączenie i miejsce na dysku.'
  }
}
export async function result<T>(action: () => T | Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await action() }
  } catch (error) {
    return { ok: false, error: safeError(error) }
  }
}
