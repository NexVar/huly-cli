import { access, copyFile, mkdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { CliError } from './output'

const SKILL_RELATIVE_PATH = ['.claude', 'commands', 'huly.md'] as const

export function getBundledSkillPath(): string {
  return resolve(__dirname, '..', '..', ...SKILL_RELATIVE_PATH)
}

export async function installBundledSkill(targetDir: string, force: boolean): Promise<{
  source: string
  destination: string
  overwritten: boolean
}> {
  const source = getBundledSkillPath()
  const destination = resolve(targetDir, ...SKILL_RELATIVE_PATH)

  try {
    await access(source, constants.R_OK)
  } catch (error) {
    throw new CliError('GENERAL_ERROR', `Bundled skill file not found: ${source}`, 1, error)
  }

  let overwritten = false

  try {
    await access(destination, constants.F_OK)
    overwritten = true
  } catch {
    overwritten = false
  }

  if (overwritten && !force) {
    throw new CliError(
      'VALIDATION_ERROR',
      `Skill file already exists: ${destination}. Pass --force to overwrite it.`,
      4
    )
  }

  await mkdir(dirname(destination), { recursive: true })
  await copyFile(source, destination)

  return {
    source,
    destination,
    overwritten
  }
}
