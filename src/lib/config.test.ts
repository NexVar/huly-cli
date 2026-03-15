import test from 'node:test'
import assert from 'node:assert/strict'
import { redactConfig } from './config'

test('redactConfig keeps only safe fields for password auth', () => {
  assert.deepEqual(
    redactConfig({
      url: 'https://huly.app',
      workspace: 'demo',
      email: 'user@example.com',
      password: 'secret'
    }),
    {
      url: 'https://huly.app',
      workspace: 'demo',
      authMethod: 'password',
      email: 'user@example.com'
    }
  )
})

test('redactConfig reports token auth without leaking token', () => {
  assert.deepEqual(
    redactConfig({
      url: 'https://huly.app',
      workspace: 'demo',
      token: 'secret-token'
    }),
    {
      url: 'https://huly.app',
      workspace: 'demo',
      authMethod: 'token',
      email: null
    }
  )
})
