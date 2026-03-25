import { Command, CommanderError } from 'commander'
import { registerAuthCommands } from './commands/auth'
import { registerCommentCommands } from './commands/comment'
import { registerComponentCommands } from './commands/component'
import { registerDocumentCommands } from './commands/document'
import { registerIssueCommands } from './commands/issue'
import { registerLabelCommands } from './commands/label'
import { registerMemberCommands } from './commands/member'
import { registerMilestoneCommands } from './commands/milestone'
import { registerNotificationCommands } from './commands/notification'
import { registerPersonCommands } from './commands/person'
import { registerProjectCommands } from './commands/project'
import { registerSetupSkillCommand } from './commands/setup-skill'
import { registerTeamspaceCommands } from './commands/teamspace'
import { registerTimeCommands } from './commands/time'
import { CliError, errorPayload, successPayload, writeErrorPayload, writeSuccessPayload } from './lib/output'

const packageJson = require('../package.json') as { version?: string }

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

export function buildProgram(): Command {
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

  registerAuthCommands(program)
  registerProjectCommands(program)
  registerIssueCommands(program)
  registerLabelCommands(program)
  registerMemberCommands(program)
  registerMilestoneCommands(program)
  registerNotificationCommands(program)
  registerPersonCommands(program)
  registerTeamspaceCommands(program)
  registerDocumentCommands(program)
  registerComponentCommands(program)
  registerCommentCommands(program)
  registerTimeCommands(program)
  registerSetupSkillCommand(program)

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
  const program = buildProgram()

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
