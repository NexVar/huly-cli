import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { readTextOption } from '../lib/files'
import {
  createTimeTodo,
  deleteTimeTodo,
  getTimeTodoSummary,
  listTimeTodos,
  reopenTimeTodo,
  completeTimeTodo,
  updateTimeTodo
} from '../lib/huly'
import { CliError } from '../lib/output'

type TimeListOptions = {
  issue?: string
  assignee?: string
  done?: boolean
  open?: boolean
  limit?: string
}

type TimeCreateOptions = {
  issue: string
  title: string
  description?: string
  descriptionFile?: string
  priority?: string
  assignee?: string
  dueDate?: string
}

type TimeUpdateOptions = {
  title?: string
  description?: string
  descriptionFile?: string
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

function parseDoneFilter(options: TimeListOptions): boolean | undefined {
  if (options.done && options.open) {
    throw new CliError('VALIDATION_ERROR', 'Use only one of --done or --open.', 4)
  }

  if (options.done) {
    return true
  }

  if (options.open) {
    return false
  }

  return undefined
}

export function registerTimeCommands(program: Command): void {
  const time = program.command('time').description('Time and issue todo commands')

  const list = time
    .command('list')
    .description('List issue todos')
    .option('--issue <identifier>', 'Filter by issue identifier')
    .option('--assignee <email>', 'Filter by assignee email')
    .option('--done', 'Only show completed todos')
    .option('--open', 'Only show open todos')
    .option('--limit <n>', 'Maximum number of todos')

  handleCommand(list, async (options: TimeListOptions) => {
    return await withClient(async (client) => await listTimeTodos(client, {
      issueIdentifier: options.issue,
      assignee: options.assignee,
      isDone: parseDoneFilter(options),
      limit: parseLimit(options.limit)
    }))
  })

  const get = time
    .command('get')
    .description('Get one todo by id')
    .argument('<id>', 'Todo id')

  handleCommand(get, async (id: string) => await withClient(async (client) => await getTimeTodoSummary(client, id)))

  const create = time
    .command('create')
    .description('Create a todo on an issue')
    .requiredOption('--issue <identifier>', 'Issue identifier')
    .requiredOption('--title <title>', 'Todo title')
    .option('--description <markdown>', 'Todo description')
    .option('--description-file <path>', 'Read todo description from a file')
    .option('--priority <priority>', 'Todo priority')
    .option('--assignee <email>', 'Assignee email; defaults to the current member')
    .option('--due-date <date>', 'Due date in ISO-8601 format')

  handleCommand(create, async (options: TimeCreateOptions) => {
    const description = await readTextOption(options.description, options.descriptionFile, 'description')

    return await withClient(async (client) => await createTimeTodo(client, {
      issueIdentifier: options.issue,
      title: options.title,
      description,
      priority: options.priority,
      assignee: options.assignee,
      dueDate: options.dueDate
    }))
  })

  const update = time
    .command('update')
    .description('Update an existing todo')
    .argument('<id>', 'Todo id')
    .option('--title <title>', 'Todo title')
    .option('--description <markdown>', 'Todo description')
    .option('--description-file <path>', 'Read todo description from a file')
    .option('--priority <priority>', 'Todo priority')
    .option('--assignee <email>', 'Assignee email')
    .option('--due-date <date>', 'Due date in ISO-8601 format')

  handleCommand(update, async (id: string, options: TimeUpdateOptions) => {
    const description = await readTextOption(options.description, options.descriptionFile, 'description')

    return await withClient(async (client) => await updateTimeTodo(client, id, {
      title: options.title,
      description,
      priority: options.priority,
      assignee: options.assignee,
      dueDate: options.dueDate
    }))
  })

  const done = time
    .command('done')
    .description('Mark a todo as done')
    .argument('<id>', 'Todo id')

  handleCommand(done, async (id: string) => await withClient(async (client) => await completeTimeTodo(client, id)))

  const open = time
    .command('open')
    .description('Reopen a completed todo')
    .argument('<id>', 'Todo id')

  handleCommand(open, async (id: string) => await withClient(async (client) => await reopenTimeTodo(client, id)))

  const remove = time
    .command('delete')
    .description('Delete a todo')
    .argument('<id>', 'Todo id')

  handleCommand(remove, async (id: string) => await withClient(async (client) => await deleteTimeTodo(client, id)))
}
