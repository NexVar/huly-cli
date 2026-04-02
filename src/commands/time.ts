import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { readTextOption } from '../lib/files'
import {
  createTimeReport,
  createTimeTodo,
  deleteTimeReport,
  deleteTimeTodo,
  getTimeReportTotals,
  getTimeReportSummary,
  getTimeTodoSummary,
  listTimeReports,
  listTimeTodos,
  reopenTimeTodo,
  completeTimeTodo,
  updateTimeReport,
  updateTimeTodo
} from '../lib/huly'
import { CliError } from '../lib/output'

type TimeListOptions = {
  issue?: string
  assignee?: string
  title?: string
  priority?: string
  done?: boolean
  open?: boolean
  dueDateFrom?: string
  dueDateTo?: string
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

type TimeReportListOptions = {
  issue?: string
  assignee?: string
  description?: string
  dateFrom?: string
  dateTo?: string
  valueFrom?: string
  valueTo?: string
  limit?: string
}

type TimeReportCreateOptions = {
  issue: string
  value: string
  description: string
  assignee?: string
  date?: string
}

type TimeReportTotalsOptions = {
  issue?: string
  assignee?: string
  description?: string
  dateFrom?: string
  dateTo?: string
  valueFrom?: string
  valueTo?: string
}

type TimeUpdateOptions = {
  title?: string
  description?: string
  descriptionFile?: string
  clearDescription?: boolean
  priority?: string
  assignee?: string
  dueDate?: string
}

type TimeReportUpdateOptions = {
  value?: string
  description?: string
  clearDescription?: boolean
  assignee?: string
  date?: string
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

function parseIsoDate(value: string | undefined, flagName: string): string | undefined {
  if (value === undefined) {
    return undefined
  }

  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) {
    throw new CliError('VALIDATION_ERROR', `Invalid ${flagName} value: ${value}`, 4)
  }

  return value
}

export function registerTimeCommands(program: Command): void {
  const time = program.command('time').description('Time and issue todo commands')

  const list = time
    .command('list')
    .description('List issue todos')
    .option('--issue <identifier>', 'Filter by issue identifier')
    .option('--assignee <email>', 'Filter by assignee email')
    .option('--title <text>', 'Filter by exact todo title')
    .option('--priority <priority>', 'Filter by todo priority')
    .option('--done', 'Only show completed todos')
    .option('--open', 'Only show open todos')
    .option('--due-date-from <date>', 'Only include todos due on or after this ISO-8601 date')
    .option('--due-date-to <date>', 'Only include todos due on or before this ISO-8601 date')
    .option('--limit <n>', 'Maximum number of todos')

  handleCommand(list, async (options: TimeListOptions) => {
    return await withClient(async (client) => await listTimeTodos(client, {
      issueIdentifier: options.issue,
      assignee: options.assignee,
      title: options.title,
      priority: options.priority,
      isDone: parseDoneFilter(options),
      dueDateFrom: parseIsoDate(options.dueDateFrom, '--due-date-from'),
      dueDateTo: parseIsoDate(options.dueDateTo, '--due-date-to'),
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
      dueDate: parseIsoDate(options.dueDate, '--due-date')
    }))
  })

  const update = time
    .command('update')
    .description('Update an existing todo')
    .argument('<id>', 'Todo id')
    .option('--title <title>', 'Todo title')
    .option('--description <markdown>', 'Todo description')
    .option('--description-file <path>', 'Read todo description from a file')
    .option('--clear-description', 'Remove the todo description')
    .option('--priority <priority>', 'Todo priority')
    .option('--assignee <email>', 'Assignee email')
    .option('--due-date <date>', 'Due date in ISO-8601 format')

  handleCommand(update, async (id: string, options: TimeUpdateOptions) => {
    if (options.clearDescription && (options.description !== undefined || options.descriptionFile !== undefined)) {
      throw new CliError('VALIDATION_ERROR', 'Use only one of --description/--description-file or --clear-description.', 4)
    }

    const description = options.clearDescription
      ? ''
      : await readTextOption(options.description, options.descriptionFile, 'description')

    return await withClient(async (client) => await updateTimeTodo(client, id, {
      title: options.title,
      description,
      priority: options.priority,
      assignee: options.assignee,
      dueDate: parseIsoDate(options.dueDate, '--due-date')
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

  const report = time.command('report').description('Issue time report commands')

  const reportList = report
    .command('list')
    .description('List issue time reports')
    .option('--issue <identifier>', 'Filter by issue identifier')
    .option('--assignee <email>', 'Filter by assignee email')
    .option('--description <text>', 'Filter by exact report description')
    .option('--date-from <date>', 'Only include reports on or after this ISO-8601 date')
    .option('--date-to <date>', 'Only include reports on or before this ISO-8601 date')
    .option('--value-from <hours>', 'Only include reports with value at or above this number of hours')
    .option('--value-to <hours>', 'Only include reports with value at or below this number of hours')
    .option('--limit <n>', 'Maximum number of time reports')

  handleCommand(reportList, async (options: TimeReportListOptions) => {
    return await withClient(async (client) => await listTimeReports(client, {
      issueIdentifier: options.issue,
      assignee: options.assignee,
      description: options.description,
      dateFrom: parseIsoDate(options.dateFrom, '--date-from'),
      dateTo: parseIsoDate(options.dateTo, '--date-to'),
      valueFrom: parseHours(options.valueFrom, '--value-from'),
      valueTo: parseHours(options.valueTo, '--value-to'),
      limit: parseLimit(options.limit)
    }))
  })

  const reportGet = report
    .command('get')
    .description('Get one time report by id')
    .argument('<id>', 'Time report id')

  handleCommand(reportGet, async (id: string) => await withClient(async (client) => await getTimeReportSummary(client, id)))

  const reportTotals = report
    .command('totals')
    .description('Aggregate issue time reports')
    .option('--issue <identifier>', 'Filter by issue identifier')
    .option('--assignee <email>', 'Filter by assignee email')
    .option('--description <text>', 'Filter by exact report description')
    .option('--date-from <date>', 'Only include reports on or after this ISO-8601 date')
    .option('--date-to <date>', 'Only include reports on or before this ISO-8601 date')
    .option('--value-from <hours>', 'Only include reports with value at or above this number of hours')
    .option('--value-to <hours>', 'Only include reports with value at or below this number of hours')

  handleCommand(reportTotals, async (options: TimeReportTotalsOptions) => {
    return await withClient(async (client) => await getTimeReportTotals(client, {
      issueIdentifier: options.issue,
      assignee: options.assignee,
      description: options.description,
      dateFrom: parseIsoDate(options.dateFrom, '--date-from'),
      dateTo: parseIsoDate(options.dateTo, '--date-to'),
      valueFrom: parseHours(options.valueFrom, '--value-from'),
      valueTo: parseHours(options.valueTo, '--value-to')
    }))
  })

  const reportCreate = report
    .command('create')
    .description('Create a time report on an issue')
    .requiredOption('--issue <identifier>', 'Issue identifier')
    .requiredOption('--value <hours>', 'Reported time in hours')
    .requiredOption('--description <text>', 'Time report description')
    .option('--assignee <email>', 'Assignee email; defaults to the current member')
    .option('--date <date>', 'Report date in ISO-8601 format; defaults to now')

  handleCommand(reportCreate, async (options: TimeReportCreateOptions) => {
    return await withClient(async (client) => await createTimeReport(client, {
      issueIdentifier: options.issue,
      value: parseHours(options.value, '--value') as number,
      description: options.description,
      assignee: options.assignee,
      date: parseIsoDate(options.date, '--date')
    }))
  })

  const reportUpdate = report
    .command('update')
    .description('Update an existing time report')
    .argument('<id>', 'Time report id')
    .option('--value <hours>', 'Reported time in hours')
    .option('--description <text>', 'Time report description')
    .option('--clear-description', 'Remove the time report description')
    .option('--assignee <email>', 'Assignee email')
    .option('--date <date>', 'Report date in ISO-8601 format')

  handleCommand(reportUpdate, async (id: string, options: TimeReportUpdateOptions) => {
    if (options.clearDescription && options.description !== undefined) {
      throw new CliError('VALIDATION_ERROR', 'Use only one of --description or --clear-description.', 4)
    }

    return await withClient(async (client) => await updateTimeReport(client, id, {
      value: parseHours(options.value, '--value'),
      description: options.clearDescription ? '' : options.description,
      assignee: options.assignee,
      date: parseIsoDate(options.date, '--date')
    }))
  })

  const reportDelete = report
    .command('delete')
    .description('Delete a time report')
    .argument('<id>', 'Time report id')

  handleCommand(reportDelete, async (id: string) => await withClient(async (client) => await deleteTimeReport(client, id)))
}
