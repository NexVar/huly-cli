import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { readTextOption } from '../lib/files'
import {
  createCard,
  createCardRole,
  createCardType,
  deleteCard,
  deleteCardRole,
  deleteCardType,
  getCardRoleSummary,
  getCardSummary,
  getCardTypeSummary,
  listCardRoles,
  listCards,
  listCardTypes,
  updateCard,
  updateCardRole,
  updateCardType
} from '../lib/huly'
import { CliError } from '../lib/output'

type CardListOptions = {
  type?: string
  parent?: string
  limit?: string
}

type CardCreateOptions = {
  title: string
  content?: string
  contentFile?: string
  type?: string
  parent?: string
  readonly?: boolean
}

type CardUpdateOptions = {
  title?: string
  content?: string
  contentFile?: string
  readonly?: boolean
  editable?: boolean
}

type CardTypeCreateOptions = {
  label: string
  extends?: string
  color?: string
  background?: string
  removed?: boolean
}

type CardTypeUpdateOptions = {
  label?: string
  extends?: string
  color?: string
  background?: string
  removed?: boolean
  notRemoved?: boolean
}

type CardRoleListOptions = {
  type: string
}

type CardRoleCreateOptions = {
  type: string
  name: string
}

type CardRoleUpdateOptions = {
  name?: string
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

function parseIntegerOption(value: string | undefined, flagName: string): number | undefined {
  if (value === undefined) {
    return undefined
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    throw new CliError('VALIDATION_ERROR', `Invalid ${flagName} value: ${value}`, 4)
  }

  return parsed
}

function parseRemovedOption(options: Pick<CardTypeUpdateOptions, 'removed' | 'notRemoved'>): boolean | undefined {
  if (options.removed && options.notRemoved) {
    throw new CliError('VALIDATION_ERROR', 'Use only one of --removed or --not-removed.', 4)
  }

  if (options.removed) {
    return true
  }

  if (options.notRemoved) {
    return false
  }

  return undefined
}

function parseReadonlyOption(options: Pick<CardUpdateOptions, 'readonly' | 'editable'>): boolean | undefined {
  if (options.readonly && options.editable) {
    throw new CliError('VALIDATION_ERROR', 'Use only one of --readonly or --editable.', 4)
  }

  if (options.readonly) {
    return true
  }

  if (options.editable) {
    return false
  }

  return undefined
}

export function registerCardCommands(program: Command): void {
  const card = program.command('card').description('Card commands')

  const types = card
    .command('types')
    .description('List available card types in the default card space')

  handleCommand(types, async () => await withClient(async (client) => await listCardTypes(client)))

  const type = card
    .command('type')
    .description('Card type commands')

  const typeList = type
    .command('list')
    .description('List available card types in the default card space')

  handleCommand(typeList, async () => await withClient(async (client) => await listCardTypes(client)))

  const typeGet = type
    .command('get')
    .description('Get one card type by id')
    .argument('<id>', 'Card type id')

  handleCommand(typeGet, async (id: string) => await withClient(async (client) => await getCardTypeSummary(client, id)))

  const typeCreate = type
    .command('create')
    .description('Create a custom card type in the default card space')
    .requiredOption('--label <label>', 'Card type label')
    .option('--extends <type>', 'Base card type id or label; defaults to Card')
    .option('--color <number>', 'Card type color index')
    .option('--background <number>', 'Card type background index')
    .option('--removed', 'Create the card type as removed')

  handleCommand(typeCreate, async (options: CardTypeCreateOptions) => {
    return await withClient(async (client) => await createCardType(client, {
      label: options.label,
      extends: options.extends,
      color: parseIntegerOption(options.color, '--color'),
      background: parseIntegerOption(options.background, '--background'),
      removed: options.removed ? true : undefined
    }))
  })

  const typeUpdate = type
    .command('update')
    .description('Update a custom card type')
    .argument('<id>', 'Card type id')
    .option('--label <label>', 'Card type label')
    .option('--extends <type>', 'Base card type id or label')
    .option('--color <number>', 'Card type color index')
    .option('--background <number>', 'Card type background index')
    .option('--removed', 'Mark the card type as removed')
    .option('--not-removed', 'Mark the card type as not removed')

  handleCommand(typeUpdate, async (id: string, options: CardTypeUpdateOptions) => {
    return await withClient(async (client) => await updateCardType(client, id, {
      label: options.label,
      extends: options.extends,
      color: parseIntegerOption(options.color, '--color'),
      background: parseIntegerOption(options.background, '--background'),
      removed: parseRemovedOption(options)
    }))
  })

  const typeDelete = type
    .command('delete')
    .description('Delete a custom card type')
    .argument('<id>', 'Card type id')

  handleCommand(typeDelete, async (id: string) => await withClient(async (client) => await deleteCardType(client, id)))

  const role = card
    .command('role')
    .description('Card role commands for custom card types')

  const roleList = role
    .command('list')
    .description('List roles on a custom card type')
    .requiredOption('--type <type>', 'Card type id')

  handleCommand(roleList, async (options: CardRoleListOptions) => {
    return await withClient(async (client) => await listCardRoles(client, { typeId: options.type }))
  })

  const roleGet = role
    .command('get')
    .description('Get one card role by id')
    .argument('<id>', 'Card role id')

  handleCommand(roleGet, async (id: string) => await withClient(async (client) => await getCardRoleSummary(client, id)))

  const roleCreate = role
    .command('create')
    .description('Create a role on a custom card type')
    .requiredOption('--type <type>', 'Card type id')
    .requiredOption('--name <name>', 'Role name')

  handleCommand(roleCreate, async (options: CardRoleCreateOptions) => {
    return await withClient(async (client) => await createCardRole(client, {
      typeId: options.type,
      name: options.name
    }))
  })

  const roleUpdate = role
    .command('update')
    .description('Update a card role')
    .argument('<id>', 'Card role id')
    .option('--name <name>', 'Role name')

  handleCommand(roleUpdate, async (id: string, options: CardRoleUpdateOptions) => {
    return await withClient(async (client) => await updateCardRole(client, id, {
      name: options.name
    }))
  })

  const roleDelete = role
    .command('delete')
    .description('Delete a card role')
    .argument('<id>', 'Card role id')

  handleCommand(roleDelete, async (id: string) => await withClient(async (client) => await deleteCardRole(client, id)))

  const list = card
    .command('list')
    .description('List cards in the default card space')
    .option('--type <type>', 'Filter by card type id or label')
    .option('--parent <id>', 'Filter by parent card id')
    .option('--limit <n>', 'Maximum number of cards')

  handleCommand(list, async (options: CardListOptions) => {
    return await withClient(async (client) => await listCards(client, {
      type: options.type,
      parentId: options.parent,
      limit: parseLimit(options.limit)
    }))
  })

  const get = card
    .command('get')
    .description('Get one card by id')
    .argument('<id>', 'Card id')

  handleCommand(get, async (id: string) => await withClient(async (client) => await getCardSummary(client, id)))

  const create = card
    .command('create')
    .description('Create a card in the default card space')
    .requiredOption('--title <title>', 'Card title')
    .option('--content <markdown>', 'Card body markdown')
    .option('--content-file <path>', 'Read card body markdown from a file')
    .option('--type <type>', 'Card type id or label; defaults to Card')
    .option('--parent <id>', 'Parent card id')
    .option('--readonly', 'Create the card as readonly')

  handleCommand(create, async (options: CardCreateOptions) => {
    const content = await readTextOption(options.content, options.contentFile, 'content')

    return await withClient(async (client) => await createCard(client, {
      title: options.title,
      content,
      type: options.type,
      parentId: options.parent,
      readonly: options.readonly ? true : undefined
    }))
  })

  const update = card
    .command('update')
    .description('Update an existing card')
    .argument('<id>', 'Card id')
    .option('--title <title>', 'Card title')
    .option('--content <markdown>', 'Card body markdown')
    .option('--content-file <path>', 'Read card body markdown from a file')
    .option('--readonly', 'Mark the card as readonly')
    .option('--editable', 'Mark the card as editable')

  handleCommand(update, async (id: string, options: CardUpdateOptions) => {
    const content = await readTextOption(options.content, options.contentFile, 'content')

    return await withClient(async (client) => await updateCard(client, id, {
      title: options.title,
      content,
      readonly: parseReadonlyOption(options)
    }))
  })

  const remove = card
    .command('delete')
    .description('Delete a card')
    .argument('<id>', 'Card id')

  handleCommand(remove, async (id: string) => await withClient(async (client) => await deleteCard(client, id)))
}
