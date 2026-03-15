import { Command } from 'commander'
import { stdin as input, stdout as output } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { connectClient } from '../lib/client'
import { getConfigPath, readConfigFile, redactConfig, removeConfigFile, writeConfigFile } from '../lib/config'
import { handleCommand } from '../lib/command'
import { CliError } from '../lib/output'
import type { AuthConfig } from '../lib/types'

type LoginOptions = {
  url?: string
  email?: string
  password?: string
  token?: string
  workspace?: string
}

async function promptPassword(): Promise<string> {
  if (!input.isTTY || !output.isTTY) {
    throw new CliError('VALIDATION_ERROR', 'Password is required. Pass --password or --token.', 4)
  }

  const readline = createInterface({ input, output })

  try {
    return await readline.question('Password: ')
  } finally {
    readline.close()
  }
}

function toAuthConfig(options: LoginOptions, password: string | undefined): AuthConfig {
  if (!options.url || !options.workspace) {
    throw new CliError('VALIDATION_ERROR', 'Both --url and --workspace are required.', 4)
  }

  if (options.token) {
    return {
      url: options.url,
      workspace: options.workspace,
      token: options.token
    }
  }

  if (!options.email) {
    throw new CliError('VALIDATION_ERROR', 'Either --token or --email must be provided.', 4)
  }

  if (!password) {
    throw new CliError('VALIDATION_ERROR', 'Password is required. Pass --password or --token.', 4)
  }

  return {
    url: options.url,
    workspace: options.workspace,
    email: options.email,
    password
  }
}

export function registerAuthCommands(program: Command): void {
  const auth = program.command('auth').description('Authentication and local config commands')

  const login = auth
    .command('login')
    .description('Validate credentials and save them to ~/.huly/config.json')
    .requiredOption('--url <url>', 'Huly base URL')
    .requiredOption('--workspace <workspace>', 'Workspace name')
    .option('--email <email>', 'User email')
    .option('--password <password>', 'User password')
    .option('--token <token>', 'Authentication token')

  handleCommand(login, async (options: LoginOptions) => {
    if (options.token && (options.email || options.password)) {
      throw new CliError('VALIDATION_ERROR', 'Use either token auth or email/password auth, not both.', 4)
    }

    const password = options.token ? undefined : (options.password ?? (await promptPassword()))
    const config = toAuthConfig(options, password)
    const { client } = await connectClient(config)

    try {
      const account = await client.getAccount()
      await writeConfigFile(config)

      return {
        saved: true,
        path: getConfigPath(),
        config: redactConfig(config),
        account
      }
    } finally {
      await client.close()
    }
  })

  const status = auth
    .command('status')
    .description('Show resolved auth config and verify the current account')

  handleCommand(status, async () => {
    const storedConfig = await readConfigFile()
    const { client, config } = await connectClient()

    try {
      const account = await client.getAccount()

      return {
        configured: true,
        configPath: getConfigPath(),
        configSource: {
          env: {
            url: Boolean(process.env.HULY_URL),
            workspace: Boolean(process.env.HULY_WORKSPACE),
            email: Boolean(process.env.HULY_EMAIL),
            password: Boolean(process.env.HULY_PASSWORD),
            token: Boolean(process.env.HULY_TOKEN)
          },
          file: storedConfig ? redactConfig(config) : null
        },
        connection: redactConfig(config),
        account
      }
    } finally {
      await client.close()
    }
  })

  const logout = auth
    .command('logout')
    .description('Remove ~/.huly/config.json')

  handleCommand(logout, async () => {
    const removed = await removeConfigFile()
    return {
      removed,
      path: getConfigPath()
    }
  })
}
