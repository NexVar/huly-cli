import { CliError } from './output'

export function resolveNullableStringOption(
  value: string | false | undefined,
  cleared: boolean | undefined,
  label: string,
  clearedLabel?: string
): string | null | undefined {
  const normalizedValue = value === false ? undefined : value
  const normalizedCleared = cleared === true || value === false

  if (normalizedValue !== undefined && normalizedCleared) {
    throw new CliError(
      'VALIDATION_ERROR',
      'Use only one of --' + label + ' or --' + (clearedLabel ?? ('no-' + label)) + '.',
      4
    )
  }

  if (normalizedCleared) {
    return null
  }

  return normalizedValue
}
