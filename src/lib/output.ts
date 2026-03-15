import type { ErrorCode, ErrorPayload, SuccessPayload } from './types'

export class CliError extends Error {
  readonly code: ErrorCode
  readonly exitCode: number
  readonly details?: unknown

  constructor(code: ErrorCode, message: string, exitCode: number, details?: unknown) {
    super(message)
    this.code = code
    this.exitCode = exitCode
    this.details = details
  }
}

export function successPayload(data: unknown, total?: number): SuccessPayload {
  return total === undefined ? { ok: true, data } : { ok: true, data, total }
}

export function errorPayload(error: CliError): ErrorPayload {
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details })
    }
  }
}

export function writeSuccessPayload(payload: SuccessPayload): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

export function writeErrorPayload(payload: ErrorPayload): void {
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`)
}
