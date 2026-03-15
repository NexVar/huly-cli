import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { getProjectSummary, listProjects } from '../lib/huly'

export function registerProjectCommands(program: Command): void {
  const project = program.command('project').description('Project commands')

  const list = project
    .command('list')
    .description('List all projects')

  handleCommand(list, async () => await withClient(async (client) => await listProjects(client)))

  const get = project
    .command('get')
    .description('Get one project by identifier')
    .argument('<identifier>', 'Project identifier')

  handleCommand(get, async (identifier: string) => await withClient(async (client) => await getProjectSummary(client, identifier)))
}
