import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { readTextOption } from '../lib/files'
import { createBoard, createBoardCard, deleteBoard, deleteBoardCard, getBoardCardSummary, getBoardSummary, listBoardCards, listBoardColumns, listBoards, updateBoard, updateBoardCard } from '../lib/huly'
import { CliError } from '../lib/output'

type BoardCreateOptions = {
  name: string
  description?: string
  private?: boolean
}

type BoardUpdateOptions = {
  name?: string
  description?: string
  private?: boolean
  public?: boolean
  archive?: boolean
  unarchive?: boolean
}

type BoardColumnListOptions = {
  board?: string
  includeEmpty?: boolean
}

type BoardCardListOptions = {
  board?: string
  status?: string
  withoutStatus?: boolean
  limit?: string
}

type BoardCardCreateOptions = {
  board: string
  title: string
  description?: string
  descriptionFile?: string
  status?: string
  location?: string
  startDate?: string
  dueDate?: string
  archive?: boolean
}

type BoardCardUpdateOptions = {
  title?: string
  description?: string
  descriptionFile?: string
  status?: string
  clearStatus?: boolean
  location?: string
  noLocation?: boolean
  startDate?: string
  noStartDate?: boolean
  dueDate?: string
  noDueDate?: boolean
  archive?: boolean
  unarchive?: boolean
}

function resolvePrivate(options: Pick<BoardUpdateOptions, 'private' | 'public'>): boolean | undefined {
  if (options.private && options.public) {
    throw new CliError('VALIDATION_ERROR', 'Use only one of --private or --public.', 4)
  }

  if (options.private) {
    return true
  }

  if (options.public) {
    return false
  }

  return undefined
}

function resolveArchived(options: { archive?: boolean, unarchive?: boolean }): boolean | undefined {
  if (options.archive && options.unarchive) {
    throw new CliError('VALIDATION_ERROR', 'Use only one of --archive or --unarchive.', 4)
  }

  if (options.archive) {
    return true
  }

  if (options.unarchive) {
    return false
  }

  return undefined
}

function parseLimit(limit: string | undefined): number | undefined {
  if (limit === undefined) {
    return undefined
  }

  const parsed = Number(limit)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliError('VALIDATION_ERROR', 'Invalid --limit value: ' + limit, 4)
  }

  return parsed
}

function parseIsoDate(value: string | undefined, flagName: string): string | undefined {
  if (value === undefined) {
    return undefined
  }

  if (Number.isNaN(new Date(value).getTime())) {
    throw new CliError('VALIDATION_ERROR', 'Invalid ' + flagName + ' value: ' + value, 4)
  }

  return value
}

function resolveNullableValue(value: string | undefined, cleared: boolean | undefined, label: string): string | null | undefined {
  if (value !== undefined && cleared) {
    throw new CliError('VALIDATION_ERROR', 'Use only one of --' + label + ' or --no-' + label + '.', 4)
  }

  if (cleared) {
    return null
  }

  return value
}

function resolveStatusFilter(options: BoardCardListOptions): string | null | undefined {
  return resolveNullableValue(options.status, options.withoutStatus, 'status')
}

export function registerBoardCommands(program: Command): void {
  const board = program.command('board').description('Board space commands')

  const list = board
    .command('list')
    .description('List boards')

  handleCommand(list, async () => await withClient(async (client) => await listBoards(client)))

  const get = board
    .command('get')
    .description('Get one board by id')
    .argument('<id>', 'Board id')

  handleCommand(get, async (id: string) => await withClient(async (client) => await getBoardSummary(client, id)))

  const create = board
    .command('create')
    .description('Create a board')
    .requiredOption('--name <name>', 'Board name')
    .option('--description <text>', 'Board description')
    .option('--private', 'Create the board as private')

  handleCommand(create, async (options: BoardCreateOptions) => {
    return await withClient(async (client) => await createBoard(client, options))
  })

  const update = board
    .command('update')
    .description('Update a board')
    .argument('<id>', 'Board id')
    .option('--name <name>', 'Board name')
    .option('--description <text>', 'Board description')
    .option('--private', 'Set the board to private')
    .option('--public', 'Set the board to public')
    .option('--archive', 'Archive the board')
    .option('--unarchive', 'Unarchive the board')

  handleCommand(update, async (id: string, options: BoardUpdateOptions) => {
    return await withClient(async (client) => await updateBoard(client, id, {
      name: options.name,
      description: options.description,
      private: resolvePrivate(options),
      archived: resolveArchived(options)
    }))
  })

  const remove = board
    .command('delete')
    .description('Delete a board')
    .argument('<id>', 'Board id')

  handleCommand(remove, async (id: string) => await withClient(async (client) => await deleteBoard(client, id)))

  const column = board
    .command('column')
    .description('Board column/state commands')

  const columnList = column
    .command('list')
    .description('List board columns derived from card statuses')
    .option('--board <id>', 'Filter by board id')
    .option('--exclude-empty', 'Exclude cards without a status')

  handleCommand(columnList, async (options: BoardColumnListOptions & { excludeEmpty?: boolean }) => {
    return await withClient(async (client) => await listBoardColumns(client, {
      boardId: options.board,
      includeEmpty: options.excludeEmpty ? false : true
    }))
  })

  const card = board
    .command('card')
    .description('Board card commands')

  const cardList = card
    .command('list')
    .description('List board cards')
    .option('--board <id>', 'Filter by board id')
    .option('--status <id>', 'Filter by status id')
    .option('--without-status', 'Filter to cards without a status')
    .option('--limit <n>', 'Maximum number of board cards')

  handleCommand(cardList, async (options: BoardCardListOptions) => {
    return await withClient(async (client) => await listBoardCards(client, {
      boardId: options.board,
      status: resolveStatusFilter(options),
      limit: parseLimit(options.limit)
    }))
  })

  const cardGet = card
    .command('get')
    .description('Get one board card by id')
    .argument('<id>', 'Board card id')

  handleCommand(cardGet, async (id: string) => await withClient(async (client) => await getBoardCardSummary(client, id)))

  const cardCreate = card
    .command('create')
    .description('Create a board card')
    .requiredOption('--board <id>', 'Board id')
    .requiredOption('--title <title>', 'Board card title')
    .option('--description <markdown>', 'Board card description markdown')
    .option('--description-file <path>', 'Read board card description markdown from a file')
    .option('--status <id>', 'Board card status id')
    .option('--location <text>', 'Board card location')
    .option('--start-date <date>', 'Board card start date in ISO-8601 format')
    .option('--due-date <date>', 'Board card due date in ISO-8601 format')
    .option('--archive', 'Create the board card as archived')

  handleCommand(cardCreate, async (options: BoardCardCreateOptions) => {
    const description = await readTextOption(options.description, options.descriptionFile, 'description')

    return await withClient(async (client) => await createBoardCard(client, {
      boardId: options.board,
      title: options.title,
      description,
      status: options.status,
      location: options.location,
      startDate: parseIsoDate(options.startDate, '--start-date'),
      dueDate: parseIsoDate(options.dueDate, '--due-date'),
      archived: options.archive ? true : undefined
    }))
  })

  const cardUpdate = card
    .command('update')
    .description('Update a board card')
    .argument('<id>', 'Board card id')
    .option('--title <title>', 'Board card title')
    .option('--description <markdown>', 'Board card description markdown')
    .option('--description-file <path>', 'Read board card description markdown from a file')
    .option('--status <id>', 'Board card status id')
    .option('--clear-status', 'Remove the board card status')
    .option('--location <text>', 'Board card location')
    .option('--no-location', 'Remove the board card location')
    .option('--start-date <date>', 'Board card start date in ISO-8601 format')
    .option('--no-start-date', 'Remove the board card start date')
    .option('--due-date <date>', 'Board card due date in ISO-8601 format')
    .option('--no-due-date', 'Remove the board card due date')
    .option('--archive', 'Archive the board card')
    .option('--unarchive', 'Unarchive the board card')

  handleCommand(cardUpdate, async (id: string, options: BoardCardUpdateOptions) => {
    const description = await readTextOption(options.description, options.descriptionFile, 'description')

    return await withClient(async (client) => await updateBoardCard(client, id, {
      title: options.title,
      description,
      status: resolveNullableValue(options.status, options.clearStatus, 'status'),
      location: resolveNullableValue(options.location, options.noLocation, 'location'),
      startDate: resolveNullableValue(parseIsoDate(options.startDate, '--start-date'), options.noStartDate, 'start-date'),
      dueDate: resolveNullableValue(parseIsoDate(options.dueDate, '--due-date'), options.noDueDate, 'due-date'),
      archived: resolveArchived(options)
    }))
  })

  const cardDelete = card
    .command('delete')
    .description('Delete a board card')
    .argument('<id>', 'Board card id')

  handleCommand(cardDelete, async (id: string) => await withClient(async (client) => await deleteBoardCard(client, id)))
}
