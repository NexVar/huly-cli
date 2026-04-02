import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { createMilestone, deleteMilestone, getMilestoneSummary, listMilestones, updateMilestone } from '../lib/huly'
import { CliError } from '../lib/output'

type MilestoneListOptions = {
  project: string
  label?: string
  status?: string
  dateFrom?: string
  dateTo?: string
  limit?: string
}

type MilestoneCreateOptions = {
  project: string
  label: string
  status?: string
  targetDate?: string
}

type MilestoneUpdateOptions = {
  label?: string
  status?: string
  targetDate?: string
}

function parseDate(value: string | undefined, flagName: string): string | undefined {
  if (value === undefined) {
    return undefined
  }

  if (Number.isNaN(Date.parse(value))) {
    throw new CliError('VALIDATION_ERROR', `Invalid ${flagName} value: ${value}`, 4)
  }

  return value
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

export function registerMilestoneCommands(program: Command): void {
  const milestone = program.command('milestone').description('Milestone commands')

  const list = milestone
    .command('list')
    .description('List milestones in a project')
    .requiredOption('--project <identifier>', 'Project identifier')
    .option('--label <text>', 'Filter by exact milestone label')
    .option('--status <status>', 'Filter by milestone status')
    .option('--date-from <date>', 'Only include milestones on or after this ISO-8601 date')
    .option('--date-to <date>', 'Only include milestones on or before this ISO-8601 date')
    .option('--limit <n>', 'Maximum number of milestones')

  handleCommand(list, async (options: MilestoneListOptions) => {
    return await withClient(async (client) => await listMilestones(client, {
      projectIdentifier: options.project,
      label: options.label,
      status: options.status,
      dateFrom: parseDate(options.dateFrom, '--date-from'),
      dateTo: parseDate(options.dateTo, '--date-to'),
      limit: parseLimit(options.limit)
    }))
  })

  const get = milestone
    .command('get')
    .description('Get one milestone by id')
    .argument('<id>', 'Milestone id')

  handleCommand(get, async (id: string) => await withClient(async (client) => await getMilestoneSummary(client, id)))

  const create = milestone
    .command('create')
    .description('Create a new milestone')
    .requiredOption('--project <identifier>', 'Project identifier')
    .requiredOption('--label <label>', 'Milestone label')
    .option('--status <status>', 'Milestone status')
    .option('--target-date <date>', 'Target date in ISO-8601 format')

  handleCommand(create, async (options: MilestoneCreateOptions) => {
    return await withClient(async (client) => await createMilestone(client, {
      projectIdentifier: options.project,
      label: options.label,
      status: options.status,
      targetDate: parseDate(options.targetDate, '--target-date')
    }))
  })

  const update = milestone
    .command('update')
    .description('Update an existing milestone')
    .argument('<id>', 'Milestone id')
    .option('--label <label>', 'Milestone label')
    .option('--status <status>', 'Milestone status')
    .option('--target-date <date>', 'Target date in ISO-8601 format')

  handleCommand(update, async (id: string, options: MilestoneUpdateOptions) => {
    return await withClient(async (client) => await updateMilestone(client, id, {
      label: options.label,
      status: options.status,
      targetDate: parseDate(options.targetDate, '--target-date')
    }))
  })

  const remove = milestone
    .command('delete')
    .description('Delete a milestone')
    .argument('<id>', 'Milestone id')

  handleCommand(remove, async (id: string) => await withClient(async (client) => await deleteMilestone(client, id)))
}
