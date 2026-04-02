import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { assignLabelToIssue, createLabel, deleteLabel, getLabelSummary, listLabels, unassignLabelFromIssue, updateLabel } from '../lib/huly'
import { CliError } from '../lib/output'

type LabelListOptions = {
  project?: string
}

type LabelCreateOptions = {
  title: string
  color?: string
  description?: string
}

type LabelAssignOptions = {
  label: string
}

type LabelUpdateOptions = {
  title?: string
  color?: string
  description?: string
  clearDescription?: boolean
}

function parseColor(color: string | undefined): number | undefined {
  if (color === undefined) {
    return undefined
  }

  const parsed = Number(color)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CliError('VALIDATION_ERROR', `Invalid --color value: ${color}`, 4)
  }

  return parsed
}

export function registerLabelCommands(program: Command): void {
  const label = program.command('label').description('Issue label commands')

  const list = label
    .command('list')
    .description('List labels')
    .option('--project <identifier>', 'Project identifier')

  handleCommand(list, async (options: LabelListOptions) => {
    return await withClient(async (client) => await listLabels(client, options.project))
  })

  const get = label
    .command('get')
    .description('Get one label by id')
    .argument('<id>', 'Label id')

  handleCommand(get, async (id: string) => await withClient(async (client) => await getLabelSummary(client, id)))

  const create = label
    .command('create')
    .description('Create a new label')
    .requiredOption('--title <title>', 'Label title')
    .option('--color <number>', 'Label color number')
    .option('--description <desc>', 'Label description')

  handleCommand(create, async (options: LabelCreateOptions) => {
    const color = parseColor(options.color)

    return await withClient(async (client) => await createLabel(client, {
      title: options.title,
      color,
      description: options.description
    }))
  })

  const update = label
    .command('update')
    .description('Update a label')
    .argument('<id>', 'Label id')
    .option('--title <title>', 'Label title')
    .option('--color <number>', 'Label color number')
    .option('--description <desc>', 'Label description')
    .option('--clear-description', 'Clear the label description')

  handleCommand(update, async (id: string, options: LabelUpdateOptions) => {
    if (options.description !== undefined && options.clearDescription) {
      throw new CliError('VALIDATION_ERROR', 'Use only one of --description or --clear-description.', 4)
    }

    const color = parseColor(options.color)

    return await withClient(async (client) => await updateLabel(client, id, {
      title: options.title,
      color,
      description: options.clearDescription ? '' : options.description
    }))
  })

  const assign = label
    .command('assign')
    .description('Assign a label to an issue')
    .argument('<identifier>', 'Issue identifier')
    .requiredOption('--label <title>', 'Label title')

  handleCommand(assign, async (identifier: string, options: LabelAssignOptions) => {
    return await withClient(async (client) => await assignLabelToIssue(client, identifier, options.label))
  })

  const unassign = label
    .command('unassign')
    .description('Remove a label from an issue')
    .argument('<identifier>', 'Issue identifier')
    .requiredOption('--label <title>', 'Label title')

  handleCommand(unassign, async (identifier: string, options: LabelAssignOptions) => {
    return await withClient(async (client) => await unassignLabelFromIssue(client, identifier, options.label))
  })

  const remove = label
    .command('delete')
    .description('Delete a label')
    .argument('<id>', 'Label id')

  handleCommand(remove, async (id: string) => await withClient(async (client) => await deleteLabel(client, id)))
}
