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
  labels?: string
  dueDate?: string
  parent?: string
  estimation?: string
  remainingTime?: string
}

type IssueUpdateOptions = {
  title?: string
  description?: string
  descriptionFile?: string
  status?: string
  priority?: string
  assignee?: string
  dueDate?: string
  milestone?: string
  estimation?: string
  remainingTime?: string
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

function parseLabels(labels: string | undefined): string[] | undefined {
  if (labels === undefined) {
    return undefined
  }

  const parsed = labels
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)

  if (parsed.length === 0) {
    throw new CliError('VALIDATION_ERROR', 'Invalid --labels value: expected at least one label title.', 4)
  }

  return Array.from(new Set(parsed))
}

function parseHours(value: string | undefined, flagName: string): number | undefined {
  if (value === undefined) {
    return undefined
  }

  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new CliError('VALIDATION_ERROR', `Invalid ${flagName} value: ${value}`, 4)
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
    .option('--labels <titles>', 'Comma-separated label titles')
    .option('--due-date <date>', 'Due date in ISO-8601 format')
    .option('--parent <identifier>', 'Parent issue identifier')
    .option('--estimation <hours>', 'Initial estimation in hours')
    .option('--remaining-time <hours>', 'Initial remaining time in hours')

  handleCommand(create, async (options: IssueCreateOptions) => {
    const description = await readTextOption(options.description, options.descriptionFile, 'description')
    const labels = parseLabels(options.labels)

    return await withClient(async (client) => await createIssue(client, {
      projectIdentifier: options.project,
      title: options.title,
      description,
      priority: options.priority,
      assignee: options.assignee,
      labels,
      dueDate: options.dueDate,
      parent: options.parent,
      estimation: parseHours(options.estimation, '--estimation'),
      remainingTime: parseHours(options.remainingTime, '--remaining-time')
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
    .option('--milestone <name>', 'Milestone label')
    .option('--estimation <hours>', 'Estimation in hours')
    .option('--remaining-time <hours>', 'Remaining time in hours')

  handleCommand(update, async (identifier: string, options: IssueUpdateOptions) => {
    const description = await readTextOption(options.description, options.descriptionFile, 'description')

    return await withClient(async (client) => await updateIssue(client, identifier, {
      title: options.title,
      description,
      status: options.status,
      priority: options.priority,
      assignee: options.assignee,
      dueDate: options.dueDate,
      milestone: options.milestone,
      estimation: parseHours(options.estimation, '--estimation'),
      remainingTime: parseHours(options.remainingTime, '--remaining-time')
    }))
  })

  const remove = issue
    .command('delete')
    .description('Delete an issue')
    .argument('<identifier>', 'Issue identifier')

  handleCommand(remove, async (identifier: string) => await withClient(async (client) => await deleteIssue(client, identifier)))
}
