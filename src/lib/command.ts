import type { Command } from 'commander'
import { successPayload, writeSuccessPayload } from './output'

export function handleCommand<T>(command: Command, fn: (...args: any[]) => Promise<T>): void {
  command.action(async (...args) => {
    const result = await fn(...args)

    if (result !== undefined) {
      writeSuccessPayload(Array.isArray(result) ? successPayload(result, result.length) : successPayload(result))
    }
  })
}
