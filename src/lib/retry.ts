export type RetryOptions = {
  retries: number
  delayMs: number
  shouldRetry: (error: unknown) => boolean
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs)
  })
}

export async function retry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  let attempt = 0
  let nextDelayMs = options.delayMs

  for (;;) {
    try {
      return await fn()
    } catch (error) {
      if (attempt >= options.retries || !options.shouldRetry(error)) {
        throw error
      }

      attempt += 1
      await sleep(nextDelayMs)
      nextDelayMs *= 2
    }
  }
}
