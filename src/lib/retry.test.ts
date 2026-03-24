import assert from 'node:assert/strict'
import test from 'node:test'
import { retry } from './retry'

test('retry retries until the operation succeeds', async () => {
  let attempts = 0

  const result = await retry(
    async () => {
      attempts += 1

      if (attempts < 3) {
        throw new Error('fetch failed')
      }

      return 'ok'
    },
    {
      retries: 2,
      delayMs: 0,
      shouldRetry: () => true
    }
  )

  assert.equal(result, 'ok')
  assert.equal(attempts, 3)
})

test('retry stops immediately when the error is not retryable', async () => {
  let attempts = 0

  await assert.rejects(
    retry(
      async () => {
        attempts += 1
        throw new Error('auth failed')
      },
      {
        retries: 3,
        delayMs: 0,
        shouldRetry: (error) => !(error instanceof Error && error.message.includes('auth'))
      }
    ),
    /auth failed/
  )

  assert.equal(attempts, 1)
})
