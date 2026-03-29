import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { readTextOption } from '../lib/files'
import { addIssueBlockers, addIssueRelations, createIssue, deleteIssue, getIssueSummary, getIssueTemplateSummary, listIssueTemplates, listIssues, removeIssueBlockers, removeIssueRelations, updateIssue } from '../lib/huly'
import { CliError } from '../lib/output'

type IssueListOptions = {
  project: string
  status: string[]
  assignee?: string
  priority?: string
  dateFrom?: string
  dateTo?: string
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

type IssueRelationMutateOptions = {
  related: string[]
}

type IssueBlockerMutateOptions = {
  blockedBy: string[]
}

type IssueTemplateListOptions = {
  project: string
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

function collectValues(value: string, previous: string[] = []): string[] {
  previous.push(value)
  return previous
}

function parseIsoDate(value: string | undefined, flagName: string): string | undefined {
  if (value === undefined) {
    return undefined
  }

  if (Number.isNaN(new Date(value).getTime())) {
    throw new CliError('VALIDATION_ERROR', `Invalid ${flagName} value: ${value}`, 4)
  }

  return value
}

export function registerIssueCommands(program: Command): void {
  const issue = program.command('issue').description('Issue commands')

  const list = issue
    .command('list')
    .description('List issues in a project')
    .requiredOption('--project <identifier>', 'Project identifier')
    .option('--status <status>', 'Status name; may be repeated', collectValues, [])
    .option('--assignee <email>', 'Assignee email')
    .option('--priority <priority>', 'Issue priority')
    .option('--date-from <date>', 'Only include issues due on or after this ISO-8601 date')
    .option('--date-to <date>', 'Only include issues due on or before this ISO-8601 date')
    .option('--limit <n>', 'Maximum number of issues')
    .option('--sort <field>', 'Sort field; prefix with - for descending')

  handleCommand(list, async (options: IssueListOptions) => {
    const limit = parseLimit(options.limit)
    return await withClient(async (client) => await listIssues(client, {
      projectIdentifier: options.project,
      statuses: options.status,
      assignee: options.assignee,
      priority: options.priority,
      dateFrom: parseIsoDate(options.dateFrom, '--date-from'),
      dateTo: parseIsoDate(options.dateTo, '--date-to'),
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

  const template = issue.command('template').description('Issue template commands')

  const templateList = template
    .command('list')
    .description('List issue templates in a project')
    .requiredOption('--project <identifier>', 'Project identifier')
    .option('--limit <n>', 'Maximum number of templates')

  handleCommand(templateList, async (options: IssueTemplateListOptions) => {
    return await withClient(async (client) => await listIssueTemplates(client, {
      projectIdentifier: options.project,
      limit: parseLimit(options.limit)
    }))
  })

  const templateGet = template
    .command('get')
    .description('Get one issue template by id')
    .argument('<id>', 'Issue template id')

  handleCommand(templateGet, async (id: string) => await withClient(async (client) => await getIssueTemplateSummary(client, id)))

  const relation = issue.command('relation').description('Issue relation commands')

  const relationAdd = relation
    .command('add')
    .description('Add related issues')
    .argument('<identifier>', 'Issue identifier')
    .option('--related <identifier>', 'Related issue identifier; may be repeated', collectValues, [])

  handleCommand(relationAdd, async (identifier: string, options: IssueRelationMutateOptions) => {
    if (options.related.length === 0) {
      throw new CliError('VALIDATION_ERROR', 'At least one --related value is required.', 4)
    }

    return await withClient(async (client) => await addIssueRelations(client, identifier, options.related))
  })

  const relationRemove = relation
    .command('remove')
    .description('Remove related issues')
    .argument('<identifier>', 'Issue identifier')
    .option('--related <identifier>', 'Related issue identifier; may be repeated', collectValues, [])

  handleCommand(relationRemove, async (identifier: string, options: IssueRelationMutateOptions) => {
    if (options.related.length === 0) {
      throw new CliError('VALIDATION_ERROR', 'At least one --related value is required.', 4)
    }

    return await withClient(async (client) => await removeIssueRelations(client, identifier, options.related))
  })

  const blocker = issue.command('blocker').description('Issue blocker commands')

  const blockerAdd = blocker
    .command('add')
    .description('Add blocking issues')
    .argument('<identifier>', 'Issue identifier')
    .option('--blocked-by <identifier>', 'Blocking issue identifier; may be repeated', collectValues, [])

  handleCommand(blockerAdd, async (identifier: string, options: IssueBlockerMutateOptions) => {
    if (options.blockedBy.length === 0) {
      throw new CliError('VALIDATION_ERROR', 'At least one --blocked-by value is required.', 4)
    }

    return await withClient(async (client) => await addIssueBlockers(client, identifier, options.blockedBy))
  })

  const blockerRemove = blocker
    .command('remove')
    .description('Remove blocking issues')
    .argument('<identifier>', 'Issue identifier')
    .option('--blocked-by <identifier>', 'Blocking issue identifier; may be repeated', collectValues, [])

  handleCommand(blockerRemove, async (identifier: string, options: IssueBlockerMutateOptions) => {
    if (options.blockedBy.length === 0) {
      throw new CliError('VALIDATION_ERROR', 'At least one --blocked-by value is required.', 4)
    }

    return await withClient(async (client) => await removeIssueBlockers(client, identifier, options.blockedBy))
  })
}
