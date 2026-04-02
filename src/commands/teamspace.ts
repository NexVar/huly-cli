import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { createTeamspace, deleteTeamspace, getTeamspaceSummary, listTeamspaces, updateTeamspace } from '../lib/huly'
import { CliError } from '../lib/output'

type TeamspaceCreateOptions = {
  name: string
  description?: string
  private?: boolean
}

type TeamspaceListOptions = {
  name?: string
  private?: boolean
  public?: boolean
  archived?: boolean
  active?: boolean
  limit?: string
}

type TeamspaceUpdateOptions = {
  name?: string
  description?: string
  clearDescription?: boolean
  private?: boolean
  public?: boolean
  archive?: boolean
  unarchive?: boolean
}

function resolvePrivate(options: Pick<TeamspaceUpdateOptions, 'private' | 'public'>): boolean | undefined {
  if (options.private && options.public) {
    throw new CliError('VALIDATION_ERROR', 'Use only one of --private or --public.', 4)
  }

  if (options.private) {
    return true
  }

  if (options.public) {
    return false
  }

  return undefined
}

function resolveArchived(options: Pick<TeamspaceUpdateOptions, 'archive' | 'unarchive'>): boolean | undefined {
  if (options.archive && options.unarchive) {
    throw new CliError('VALIDATION_ERROR', 'Use only one of --archive or --unarchive.', 4)
  }

  if (options.archive) {
    return true
  }

  if (options.unarchive) {
    return false
  }

  return undefined
}

function resolveArchivedFilter(options: { archived?: boolean, active?: boolean }): boolean | undefined {
  if (options.archived && options.active) {
    throw new CliError('VALIDATION_ERROR', 'Use only one of --archived or --active.', 4)
  }

  if (options.archived) {
    return true
  }

  if (options.active) {
    return false
  }

  return undefined
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

function resolveDescription(options: Pick<TeamspaceUpdateOptions, 'description' | 'clearDescription'>): string | undefined {
  if (options.description !== undefined && options.clearDescription) {
    throw new CliError('VALIDATION_ERROR', 'Use only one of --description or --clear-description.', 4)
  }

  if (options.clearDescription) {
    return ''
  }

  return options.description
}

export function registerTeamspaceCommands(program: Command): void {
  const teamspace = program.command('teamspace').description('Teamspace commands')

  const list = teamspace
    .command('list')
    .description('List all teamspaces')
    .option('--name <text>', 'Filter by exact teamspace name')
    .option('--private', 'Filter to private teamspaces')
    .option('--public', 'Filter to public teamspaces')
    .option('--archived', 'Filter to archived teamspaces')
    .option('--active', 'Filter to active teamspaces')
    .option('--limit <n>', 'Maximum number of teamspaces')

  handleCommand(list, async (options: TeamspaceListOptions) => {
    return await withClient(async (client) => await listTeamspaces(client, {
      name: options.name,
      private: resolvePrivate(options),
      archived: resolveArchivedFilter(options),
      limit: parseLimit(options.limit)
    }))
  })

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

  const get = teamspace
    .command('get')
    .description('Get one teamspace by id')
    .argument('<id>', 'Teamspace id')

  handleCommand(get, async (id: string) => await withClient(async (client) => await getTeamspaceSummary(client, id)))

  const update = teamspace
    .command('update')
    .description('Update a teamspace')
    .argument('<id>', 'Teamspace id')
    .option('--name <name>', 'Teamspace name')
    .option('--description <description>', 'Teamspace description')
    .option('--clear-description', 'Clear the teamspace description')
    .option('--private', 'Set the teamspace to private')
    .option('--public', 'Set the teamspace to public')
    .option('--archive', 'Archive the teamspace')
    .option('--unarchive', 'Unarchive the teamspace')

  handleCommand(update, async (id: string, options: TeamspaceUpdateOptions) => {
    return await withClient(async (client) => await updateTeamspace(client, id, {
      name: options.name,
      description: resolveDescription(options),
      private: resolvePrivate(options),
      archived: resolveArchived(options)
    }))
  })

  const remove = teamspace
    .command('delete')
    .description('Delete a teamspace')
    .argument('<id>', 'Teamspace id')

  handleCommand(remove, async (id: string) => await withClient(async (client) => await deleteTeamspace(client, id)))
}
