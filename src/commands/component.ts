import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { readTextOption } from '../lib/files'
import { createComponent, deleteComponent, getComponentSummary, listComponents, updateComponent } from '../lib/huly'
import { CliError } from '../lib/output'

type ComponentUpdateOptions = {
  label?: string
  description?: string
  descriptionFile?: string
  clearDescription?: boolean
}

type ComponentListOptions = {
  project: string
}

type ComponentCreateOptions = {
  project: string
  label: string
  description?: string
  descriptionFile?: string
}

export function registerComponentCommands(program: Command): void {
  const component = program.command('component').description('Project component commands')

  const list = component
    .command('list')
    .description('List components in a project')
    .requiredOption('--project <identifier>', 'Project identifier')

  handleCommand(list, async (options: ComponentListOptions) => {
    return await withClient(async (client) => await listComponents(client, options.project))
  })

  const get = component
    .command('get')
    .description('Get one component by id')
    .argument('<id>', 'Component id')

  handleCommand(get, async (id: string) => await withClient(async (client) => await getComponentSummary(client, id)))

  const create = component
    .command('create')
    .description('Create a new component')
    .requiredOption('--project <identifier>', 'Project identifier')
    .requiredOption('--label <label>', 'Component label')
    .option('--description <markdown>', 'Component description')
    .option('--description-file <path>', 'Read component description from a file')

  handleCommand(create, async (options: ComponentCreateOptions) => {
    const description = await readTextOption(options.description, options.descriptionFile, 'description')

    return await withClient(async (client) => await createComponent(client, {
      projectIdentifier: options.project,
      label: options.label,
      description
    }))
  })

  const update = component
    .command('update')
    .description('Update a component')
    .argument('<id>', 'Component id')
    .option('--label <label>', 'Component label')
    .option('--description <markdown>', 'Component description')
    .option('--description-file <path>', 'Read component description from a file')
    .option('--clear-description', 'Clear the component description')

  handleCommand(update, async (id: string, options: ComponentUpdateOptions) => {
    if (options.clearDescription && (options.description !== undefined || options.descriptionFile !== undefined)) {
      throw new CliError('VALIDATION_ERROR', 'Use only one of --description/--description-file or --clear-description.', 4)
    }

    const description = options.clearDescription
      ? ''
      : await readTextOption(options.description, options.descriptionFile, 'description')

    return await withClient(async (client) => await updateComponent(client, id, {
      label: options.label,
      description
    }))
  })

  const remove = component
    .command('delete')
    .description('Delete a component')
    .argument('<id>', 'Component id')

  handleCommand(remove, async (id: string) => await withClient(async (client) => await deleteComponent(client, id)))
}
