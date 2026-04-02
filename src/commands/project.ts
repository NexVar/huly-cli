import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { createProject, deleteProject, getProjectSummary, listProjects, updateProject } from '../lib/huly'
import { CliError } from '../lib/output'

type ProjectCreateOptions = {
  identifier: string
  name: string
  description?: string
}

type ProjectUpdateOptions = {
  identifier?: string
  name?: string
  description?: string
  clearDescription?: boolean
}

function resolveDescription(options: Pick<ProjectUpdateOptions, 'description' | 'clearDescription'>): string | undefined {
  if (options.description !== undefined && options.clearDescription) {
    throw new CliError('VALIDATION_ERROR', 'Use only one of --description or --clear-description.', 4)
  }

  if (options.clearDescription) {
    return ''
  }

  return options.description
}

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

  const create = project
    .command('create')
    .description('Create a project')
    .requiredOption('--identifier <identifier>', 'Project identifier')
    .requiredOption('--name <name>', 'Project name')
    .option('--description <text>', 'Project description')

  handleCommand(create, async (options: ProjectCreateOptions) => await withClient(async (client) => await createProject(client, {
    identifier: options.identifier,
    name: options.name,
    description: options.description
  })))

  const update = project
    .command('update')
    .description('Update a project')
    .argument('<identifier>', 'Project identifier')
    .option('--identifier <identifier>', 'New project identifier')
    .option('--name <name>', 'Project name')
    .option('--description <text>', 'Project description')
    .option('--clear-description', 'Clear the project description')

  handleCommand(update, async (identifier: string, options: ProjectUpdateOptions) => await withClient(async (client) => await updateProject(client, identifier, {
    identifier: options.identifier,
    name: options.name,
    description: resolveDescription(options)
  })))

  const remove = project
    .command('delete')
    .description('Delete a project')
    .argument('<identifier>', 'Project identifier')

  handleCommand(remove, async (identifier: string) => await withClient(async (client) => await deleteProject(client, identifier)))
}
