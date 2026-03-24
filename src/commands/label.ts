import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { assignLabelToIssue, createLabel, listLabels } from '../lib/huly'
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

  const assign = label
    .command('assign')
    .description('Assign a label to an issue')
    .argument('<identifier>', 'Issue identifier')
    .requiredOption('--label <title>', 'Label title')

  handleCommand(assign, async (identifier: string, options: LabelAssignOptions) => {
    return await withClient(async (client) => await assignLabelToIssue(client, identifier, options.label))
  })
}
