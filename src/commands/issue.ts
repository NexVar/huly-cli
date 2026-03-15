import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { readTextOption } from '../lib/files'
import { createIssue, deleteIssue, getIssueSummary, listIssues, updateIssue } from '../lib/huly'
import { CliError } from '../lib/output'

type IssueListOptions = {
  project: string
  status?: string
  assignee?: string
  priority?: string
  limit?: string
  sort?: string
}

type IssueCreateOptions = {
  project: string
  title: string
  description?: string
  descriptionFile?: string
  priority?: string
  assignee?: string
  dueDate?: string
}

type IssueUpdateOptions = {
  title?: string
  description?: string
  descriptionFile?: string
  status?: string
  priority?: string
  assignee?: string
  dueDate?: string
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

export function registerIssueCommands(program: Command): void {
  const issue = program.command('issue').description('Issue commands')

  const list = issue
    .command('list')
    .description('List issues in a project')
    .requiredOption('--project <identifier>', 'Project identifier')
    .option('--status <status>', 'Status name')
    .option('--assignee <email>', 'Assignee email')
    .option('--priority <priority>', 'Issue priority')
    .option('--limit <n>', 'Maximum number of issues')
    .option('--sort <field>', 'Sort field; prefix with - for descending')

  handleCommand(list, async (options: IssueListOptions) => {
    const limit = parseLimit(options.limit)
    return await withClient(async (client) => await listIssues(client, {
      projectIdentifier: options.project,
      status: options.status,
      assignee: options.assignee,
      priority: options.priority,
      limit,
      sort: options.sort
    }))
  })

  const get = issue
    .command('get')
    .description('Get one issue by identifier')
    .argument('<identifier>', 'Issue identifier')

  handleCommand(get, async (identifier: string) => await withClient(async (client) => await getIssueSummary(client, identifier)))

  const create = issue
    .command('create')
    .description('Create a new issue')
    .requiredOption('--project <identifier>', 'Project identifier')
    .requiredOption('--title <title>', 'Issue title')
    .option('--description <markdown>', 'Issue description')
    .option('--description-file <path>', 'Read issue description from a file')
    .option('--priority <priority>', 'Issue priority')
    .option('--assignee <email>', 'Assignee email')
    .option('--due-date <date>', 'Due date in ISO-8601 format')

  handleCommand(create, async (options: IssueCreateOptions) => {
    const description = await readTextOption(options.description, options.descriptionFile, 'description')

    return await withClient(async (client) => await createIssue(client, {
      projectIdentifier: options.project,
      title: options.title,
      description,
      priority: options.priority,
      assignee: options.assignee,
      dueDate: options.dueDate
    }))
  })

  const update = issue
    .command('update')
    .description('Update an existing issue')
    .argument('<identifier>', 'Issue identifier')
    .option('--title <title>', 'Issue title')
    .option('--description <markdown>', 'Issue description')
    .option('--description-file <path>', 'Read issue description from a file')
    .option('--status <status>', 'Status name')
    .option('--priority <priority>', 'Issue priority')
    .option('--assignee <email>', 'Assignee email')
    .option('--due-date <date>', 'Due date in ISO-8601 format')

  handleCommand(update, async (identifier: string, options: IssueUpdateOptions) => {
    const description = await readTextOption(options.description, options.descriptionFile, 'description')

    return await withClient(async (client) => await updateIssue(client, identifier, {
      title: options.title,
      description,
      status: options.status,
      priority: options.priority,
      assignee: options.assignee,
      dueDate: options.dueDate
    }))
  })

  const remove = issue
    .command('delete')
    .description('Delete an issue')
    .argument('<identifier>', 'Issue identifier')

  handleCommand(remove, async (identifier: string) => await withClient(async (client) => await deleteIssue(client, identifier)))
}
