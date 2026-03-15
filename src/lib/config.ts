import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { CliError } from './output'
import type { AuthConfig, ConfigFile } from './types'

const HULY_DIR_NAME = '.huly'
const CONFIG_FILE_NAME = 'config.json'

export function getConfigDir(): string {
  return path.join(os.homedir(), HULY_DIR_NAME)
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), CONFIG_FILE_NAME)
}

export async function readConfigFile(): Promise<ConfigFile | undefined> {
  try {
    const raw = await readFile(getConfigPath(), 'utf8')
    const parsed = JSON.parse(raw) as ConfigFile
    return parsed
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }

    throw new CliError('GENERAL_ERROR', 'Failed to read ~/.huly/config.json', 1, error)
  }
}

export async function writeConfigFile(config: AuthConfig): Promise<void> {
  try {
    await mkdir(getConfigDir(), { recursive: true })
    await writeFile(getConfigPath(), JSON.stringify(config, null, 2))
  } catch (error) {
    throw new CliError('GENERAL_ERROR', 'Failed to write ~/.huly/config.json', 1, error)
  }
}

export async function removeConfigFile(): Promise<boolean> {
  try {
    await rm(getConfigPath())
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }

    throw new CliError('GENERAL_ERROR', 'Failed to remove ~/.huly/config.json', 1, error)
  }
}

function isNonEmpty(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0
}

function mergeValue(envValue: string | undefined, fileValue: string | undefined): string | undefined {
  return isNonEmpty(envValue) ? envValue : fileValue
}

export async function resolveAuthConfig(): Promise<AuthConfig> {
  const fileConfig = await readConfigFile()

  const url = mergeValue(process.env.HULY_URL, fileConfig?.url)
  const workspace = mergeValue(process.env.HULY_WORKSPACE, fileConfig?.workspace)
  const email = mergeValue(process.env.HULY_EMAIL, fileConfig?.email)
  const password = mergeValue(process.env.HULY_PASSWORD, fileConfig?.password)
  const token = mergeValue(process.env.HULY_TOKEN, fileConfig?.token)

  if (!url || !workspace) {
    throw new CliError(
      'AUTH_REQUIRED',
      'Missing Huly configuration. Set HULY_URL and HULY_WORKSPACE or run `huly auth login`.',
      2
    )
  }

  if (token) {
    return { url, workspace, token }
  }

  if (email && password) {
    return { url, workspace, email, password }
  }

  throw new CliError(
    'AUTH_REQUIRED',
    'Missing Huly credentials. Set HULY_EMAIL/HULY_PASSWORD, HULY_TOKEN, or run `huly auth login`.',
    2
  )
}

export function redactConfig(config: AuthConfig): Record<string, unknown> {
  return {
    url: config.url,
    workspace: config.workspace,
    authMethod: 'token' in config ? 'token' : 'password',
    email: 'email' in config ? config.email : null
  }
}
