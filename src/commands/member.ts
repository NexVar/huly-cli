import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { getCurrentMember, listMembers } from '../lib/huly'
import { CliError } from '../lib/output'

type MemberListOptions = {
  limit?: string
}

function parseLimit(limit: string | undefined): number | undefined {
  if (limit === undefined) {
    return undefined
  }

  const parsed = Number(limit)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliError('VALIDATION_ERROR', `Invalid --limit value: ${limit}`, 4)
  }

  return parsed
}

export function registerMemberCommands(program: Command): void {
  const member = program.command('member').description('Workspace member commands')

  const list = member
    .command('list')
    .description('List workspace members')
    .option('--limit <n>', 'Maximum number of members')

  handleCommand(list, async (options: MemberListOptions) => {
    const limit = parseLimit(options.limit)
    return await withClient(async (client) => await listMembers(client, limit))
  })

  const me = member
    .command('me')
    .description('Get the current authenticated account')

  handleCommand(me, async () => await withClient(async (client) => await getCurrentMember(client)))
}
