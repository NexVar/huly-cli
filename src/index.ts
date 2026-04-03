import { Command, CommanderError } from 'commander'
import { CliError, errorPayload, successPayload, writeErrorPayload, writeSuccessPayload } from './lib/output'

const packageJson = require('../package.json') as { version?: string }

type CommandLoader = (program: Command) => Promise<void>

const commandLoaders = [
  {
    name: 'auth',
    load: async (program: Command) => {
      const { registerAuthCommands } = await import('./commands/auth')
      registerAuthCommands(program)
    }
  },
  {
    name: 'board',
    load: async (program: Command) => {
      const { registerBoardCommands } = await import('./commands/board')
      registerBoardCommands(program)
    }
  },
  {
    name: 'card',
    load: async (program: Command) => {
      const { registerCardCommands } = await import('./commands/card')
      registerCardCommands(program)
    }
  },
  {
    name: 'chat',
    load: async (program: Command) => {
      const { registerChatCommands } = await import('./commands/chat')
      registerChatCommands(program)
    }
  },
  {
    name: 'drive',
    load: async (program: Command) => {
      const { registerDriveCommands } = await import('./commands/drive')
      registerDriveCommands(program)
    }
  },
  {
    name: 'hr',
    load: async (program: Command) => {
      const { registerHrCommands } = await import('./commands/hr')
      registerHrCommands(program)
    }
  },
  {
    name: 'project',
    load: async (program: Command) => {
      const { registerProjectCommands } = await import('./commands/project')
      registerProjectCommands(program)
    }
  },
  {
    name: 'issue',
    load: async (program: Command) => {
      const { registerIssueCommands } = await import('./commands/issue')
      registerIssueCommands(program)
    }
  },
  {
    name: 'label',
    load: async (program: Command) => {
      const { registerLabelCommands } = await import('./commands/label')
      registerLabelCommands(program)
    }
  },
  {
    name: 'member',
    load: async (program: Command) => {
      const { registerMemberCommands } = await import('./commands/member')
      registerMemberCommands(program)
    }
  },
  {
    name: 'milestone',
    load: async (program: Command) => {
      const { registerMilestoneCommands } = await import('./commands/milestone')
      registerMilestoneCommands(program)
    }
  },
  {
    name: 'notification',
    load: async (program: Command) => {
      const { registerNotificationCommands } = await import('./commands/notification')
      registerNotificationCommands(program)
    }
  },
  {
    name: 'person',
    load: async (program: Command) => {
      const { registerPersonCommands } = await import('./commands/person')
      registerPersonCommands(program)
    }
  },
  {
    name: 'raw',
    load: async (program: Command) => {
      const { registerRawCommands } = await import('./commands/raw')
      registerRawCommands(program)
    }
  },
  {
    name: 'teamspace',
    load: async (program: Command) => {
      const { registerTeamspaceCommands } = await import('./commands/teamspace')
      registerTeamspaceCommands(program)
    }
  },
  {
    name: 'doc',
    load: async (program: Command) => {
      const { registerDocumentCommands } = await import('./commands/document')
      registerDocumentCommands(program)
    }
  },
  {
    name: 'component',
    load: async (program: Command) => {
      const { registerComponentCommands } = await import('./commands/component')
      registerComponentCommands(program)
    }
  },
  {
    name: 'comment',
    load: async (program: Command) => {
      const { registerCommentCommands } = await import('./commands/comment')
      registerCommentCommands(program)
    }
  },
  {
    name: 'recruit',
    load: async (program: Command) => {
      const { registerRecruitCommands } = await import('./commands/recruit')
      registerRecruitCommands(program)
    }
  },
  {
    name: 'time',
    load: async (program: Command) => {
      const { registerTimeCommands } = await import('./commands/time')
      registerTimeCommands(program)
    }
  }
] as const

const commandLoaderMap = new Map<string, CommandLoader>(commandLoaders.map(({ name, load }) => [name, load]))

type HelpArgument = {
  name: string
  required: boolean
  variadic: boolean
  description: string
}

type HelpOption = {
  flags: string
  description: string
  required: boolean
  defaultValue?: unknown
}

type HelpCommand = {
  name: string
  summary: string
}

type HelpPayload = {
  command: string
  description: string
  usage: string
  arguments: HelpArgument[]
  options: HelpOption[]
  commands: HelpCommand[]
}

type RequestedNamespace = 'all' | 'none' | string

function createProgram(): Command {
  const program = new Command()

  program
    .name('huly')
    .description('JSON-first CLI for the Huly Platform API')
    .helpOption(false)
    .addHelpCommand(false)
    .exitOverride()
    .configureOutput({
      writeErr: (str) => {
        process.stderr.write(str)
      }
    })

  return program
}

function getRequestedNamespace(argv: string[]): RequestedNamespace {
  const args = argv.slice(2)
  const [first, second] = args

  if (args.includes('--version') || args.includes('-V')) {
    return 'none'
  }

  if (first === 'help') {
    return second !== undefined && commandLoaderMap.has(second) ? second : 'all'
  }

  return first !== undefined && commandLoaderMap.has(first) ? first : 'all'
}

async function loadAllCommands(program: Command): Promise<void> {
  for (const { load } of commandLoaders) {
    await load(program)
  }
}

async function loadRequestedCommands(program: Command, argv: string[]): Promise<void> {
  const requestedNamespace = getRequestedNamespace(argv)

  if (requestedNamespace === 'none') {
    return
  }

  if (requestedNamespace === 'all') {
    await loadAllCommands(program)
    return
  }

  const load = commandLoaderMap.get(requestedNamespace)

  if (!load) {
    await loadAllCommands(program)
    return
  }

  await load(program)
}

export async function buildProgram(argv: string[] = []): Promise<Command> {
  const program = createProgram()
  await loadRequestedCommands(program, argv)
  return program
}

function toHelpPayload(command: Command): HelpPayload {
  const argumentsList = ((command as any).registeredArguments ?? []) as Array<{
    name: () => string
    required?: boolean
    variadic?: boolean
    description?: string
  }>

  return {
    command: command.name(),
    description: command.description(),
    usage: command.usage(),
    arguments: argumentsList.map((argument) => ({
      name: argument.name(),
      required: Boolean(argument.required),
      variadic: Boolean(argument.variadic),
      description: argument.description ?? ''
    })),
    options: command.options.map((option) => ({
      flags: option.flags,
      description: option.description,
      required: option.required,
      ...(option.defaultValue === undefined ? {} : { defaultValue: option.defaultValue })
    })),
    commands: command.commands.map((subcommand) => ({
      name: subcommand.name(),
      summary: subcommand.description()
    }))
  }
}

function findSubcommand(command: Command, token: string): Command | undefined {
  return command.commands.find((candidate) => candidate.name() === token || candidate.aliases().includes(token))
}

function resolveCommandForHelp(program: Command, tokens: string[]): Command {
  let current = program

  for (const token of tokens) {
    if (token.startsWith('-')) {
      break
    }

    const next = findSubcommand(current, token)

    if (!next) {
      break
    }

    current = next
  }

  return current
}

function handleMetadataRequest(program: Command, argv: string[]): boolean {
  const args = argv.slice(2)

  if (args.includes('--version') || args.includes('-V')) {
    writeSuccessPayload(successPayload({
      name: program.name(),
      version: packageJson.version ?? '0.0.0'
    }))
    return true
  }

  if (args[0] === 'help') {
    const target = resolveCommandForHelp(program, args.slice(1))
    writeSuccessPayload(successPayload(toHelpPayload(target)))
    return true
  }

  const helpIndex = args.findIndex((arg) => arg === '--help' || arg === '-h')

  if (helpIndex === -1) {
    return false
  }

  const target = resolveCommandForHelp(program, args.slice(0, helpIndex))
  writeSuccessPayload(successPayload(toHelpPayload(target)))
  return true
}

function toCliError(error: unknown): CliError {
  if (error instanceof CliError) {
    return error
  }

  if (error instanceof CommanderError) {
    return new CliError(
      'VALIDATION_ERROR',
      error.message,
      4,
      error.code === 'commander.unknownOption' ? { commanderCode: error.code } : undefined
    )
  }

  if (error instanceof Error) {
    return new CliError('GENERAL_ERROR', error.message, 1)
  }

  return new CliError('GENERAL_ERROR', 'Unknown error', 1)
}

export async function main(argv: string[]): Promise<void> {
  const program = await buildProgram(argv)

  try {
    if (handleMetadataRequest(program, argv)) {
      return
    }

    await program.parseAsync(argv)
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) {
      return
    }

    const cliError = toCliError(error)
    writeErrorPayload(errorPayload(cliError))
    process.exitCode = cliError.exitCode
  }
}
