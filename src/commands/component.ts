import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { readTextOption } from '../lib/files'
import { createComponent, listComponents } from '../lib/huly'

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
}
