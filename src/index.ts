import { Command, CommanderError } from 'commander'
import { registerAuthCommands } from './commands/auth'
import { registerDocumentCommands } from './commands/document'
import { registerIssueCommands } from './commands/issue'
import { registerMemberCommands } from './commands/member'
import { registerMilestoneCommands } from './commands/milestone'
import { registerPersonCommands } from './commands/person'
import { registerProjectCommands } from './commands/project'
import { registerTeamspaceCommands } from './commands/teamspace'
import { CliError, errorPayload, writeErrorPayload } from './lib/output'

export function buildProgram(): Command {
  const program = new Command()

  program
    .name('huly')
    .description('JSON-first CLI for the Huly Platform API')
    .showHelpAfterError()
    .exitOverride()
    .configureOutput({
      writeErr: (str) => {
        process.stderr.write(str)
      }
    })

  registerAuthCommands(program)
  registerProjectCommands(program)
  registerIssueCommands(program)
  registerMemberCommands(program)
  registerMilestoneCommands(program)
  registerPersonCommands(program)
  registerTeamspaceCommands(program)
  registerDocumentCommands(program)

  return program
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
