import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { createMilestone, listMilestones, updateMilestone } from '../lib/huly'
import { CliError } from '../lib/output'

type MilestoneListOptions = {
  project: string
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

export function registerMilestoneCommands(program: Command): void {
  const milestone = program.command('milestone').description('Milestone commands')

  const list = milestone
    .command('list')
    .description('List milestones in a project')
    .requiredOption('--project <identifier>', 'Project identifier')

  handleCommand(list, async (options: MilestoneListOptions) => {
    return await withClient(async (client) => await listMilestones(client, options.project))
  })

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
}
