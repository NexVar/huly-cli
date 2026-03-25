import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { readTextOption } from '../lib/files'
import { createCard, deleteCard, getCardSummary, listCards, listCardTypes, updateCard } from '../lib/huly'
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
}

type CardUpdateOptions = {
  title?: string
  content?: string
  contentFile?: string
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

export function registerCardCommands(program: Command): void {
  const card = program.command('card').description('Card commands')

  const types = card
    .command('types')
    .description('List available card types in the default card space')

  handleCommand(types, async () => await withClient(async (client) => await listCardTypes(client)))

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

  handleCommand(create, async (options: CardCreateOptions) => {
    const content = await readTextOption(options.content, options.contentFile, 'content')

    return await withClient(async (client) => await createCard(client, {
      title: options.title,
      content,
      type: options.type,
      parentId: options.parent
    }))
  })

  const update = card
    .command('update')
    .description('Update an existing card')
    .argument('<id>', 'Card id')
    .option('--title <title>', 'Card title')
    .option('--content <markdown>', 'Card body markdown')
    .option('--content-file <path>', 'Read card body markdown from a file')

  handleCommand(update, async (id: string, options: CardUpdateOptions) => {
    const content = await readTextOption(options.content, options.contentFile, 'content')

    return await withClient(async (client) => await updateCard(client, id, {
      title: options.title,
      content
    }))
  })

  const remove = card
    .command('delete')
    .description('Delete a card')
    .argument('<id>', 'Card id')

  handleCommand(remove, async (id: string) => await withClient(async (client) => await deleteCard(client, id)))
}
