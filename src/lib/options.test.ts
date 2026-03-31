import assert from 'node:assert/strict'
import test from 'node:test'
import { CliError } from './output'
import { resolveNullableStringOption } from './options'

test('resolveNullableStringOption returns the provided string value', () => {
  assert.equal(resolveNullableStringOption('abc', undefined, 'assignee'), 'abc')
})

test('resolveNullableStringOption returns null for an explicit clear flag', () => {
  assert.equal(resolveNullableStringOption(undefined, true, 'assignee', 'clear-assignee'), null)
})

test('resolveNullableStringOption treats commander negated values as clears', () => {
  assert.equal(resolveNullableStringOption(false, undefined, 'location'), null)
})

test('resolveNullableStringOption rejects conflicting set and clear input', () => {
  assert.throws(
    () => resolveNullableStringOption('abc', true, 'assignee', 'clear-assignee'),
    (error: unknown) => {
      assert.ok(error instanceof CliError)
      assert.equal(error.code, 'VALIDATION_ERROR')
      assert.match(error.message, /--assignee/)
      assert.match(error.message, /--clear-assignee/)
      return true
    }
  )
})
