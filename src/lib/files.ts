import { readFile } from 'node:fs/promises'
import { CliError } from './output'

export async function readTextOption(
  value: string | undefined,
  filePath: string | undefined,
  fieldName: string
): Promise<string | undefined> {
  if (value && filePath) {
    throw new CliError('VALIDATION_ERROR', `Use either --${fieldName} or --${fieldName}-file, not both.`, 4)
  }

  if (value) {
    return value
  }

  if (!filePath) {
    return undefined
  }

  try {
    return await readFile(filePath, 'utf8')
  } catch (error) {
    throw new CliError('VALIDATION_ERROR', `Failed to read ${fieldName} file: ${filePath}`, 4, error)
  }
}
