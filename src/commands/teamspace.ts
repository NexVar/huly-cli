import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { createTeamspace, listTeamspaces } from '../lib/huly'

type TeamspaceCreateOptions = {
  name: string
  description?: string
  private?: boolean
}

export function registerTeamspaceCommands(program: Command): void {
  const teamspace = program.command('teamspace').description('Teamspace commands')

  const list = teamspace
    .command('list')
    .description('List all teamspaces')

  handleCommand(list, async () => await withClient(async (client) => await listTeamspaces(client)))

  const create = teamspace
    .command('create')
    .description('Create a new teamspace')
    .requiredOption('--name <name>', 'Teamspace name')
    .option('--description <description>', 'Teamspace description')
    .option('--private', 'Create a private teamspace', false)

  handleCommand(create, async (options: TeamspaceCreateOptions) => {
    return await withClient(async (client) => await createTeamspace(client, {
      name: options.name,
      description: options.description,
      private: options.private
    }))
  })
}
