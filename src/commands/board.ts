import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { readTextOption } from '../lib/files'
import { createBoard, createBoardCard, deleteBoard, deleteBoardCard, getBoardCardSummary, getBoardColumnSummary, getBoardSummary, listBoardCards, listBoardColumns, listBoards, moveBoardCard, updateBoard, updateBoardCard } from '../lib/huly'
import { resolveNullableStringOption } from '../lib/options'
import { CliError } from '../lib/output'

type BoardCreateOptions = {
  name: string
  description?: string
  color?: string
  background?: string
  private?: boolean
}

type BoardListOptions = {
  name?: string
  private?: boolean
  public?: boolean
  archived?: boolean
  active?: boolean
}

type BoardUpdateOptions = {
  name?: string
  description?: string
  color?: string
  clearColor?: boolean
  background?: string
  clearBackground?: boolean
  private?: boolean
  public?: boolean
  archive?: boolean
  unarchive?: boolean
}

type BoardColumnListOptions = {
  board?: string
  includeEmpty?: boolean
}

type BoardColumnGetOptions = {
  board: string
  status?: string
  withoutStatus?: boolean
  cardsLimit?: string
}

type BoardCardListOptions = {
  board?: string
  title?: string
  location?: string
  status?: string
  withoutStatus?: boolean
  assignee?: string
  withoutAssignee?: boolean
  member?: string
  archived?: boolean
  active?: boolean
  limit?: string
}

type BoardCardCreateOptions = {
  board: string
  title: string
  description?: string
  descriptionFile?: string
  coverColor?: string
  coverSize?: string
  members?: string
  status?: string
  assignee?: string
  location?: string
  startDate?: string
  dueDate?: string
  archive?: boolean
}

type BoardCardUpdateOptions = {
  title?: string
  description?: string
  descriptionFile?: string
  coverColor?: string
  coverSize?: string
  clearCover?: boolean
  members?: string
  clearMembers?: boolean
  status?: string
  clearStatus?: boolean
  assignee?: string
  clearAssignee?: boolean
  location?: string | false
  startDate?: string | false
  dueDate?: string | false
  archive?: boolean
  unarchive?: boolean
}

type BoardCardMoveOptions = {
  before?: string
  after?: string
  top?: boolean
  bottom?: boolean
  status?: string
  clearStatus?: boolean
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

function resolveArchivedFilter(options: { archived?: boolean, active?: boolean }): boolean | undefined {
  if (options.archived && options.active) {
    throw new CliError('VALIDATION_ERROR', 'Use only one of --archived or --active.', 4)
  }

  if (options.archived) {
    return true
  }

  if (options.active) {
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

function parseIntegerOption(value: string | undefined, flagName: string): number | undefined {
  if (value === undefined) {
    return undefined
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    throw new CliError('VALIDATION_ERROR', 'Invalid ' + flagName + ' value: ' + value, 4)
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

function resolveStatusFilter(options: BoardCardListOptions): string | null | undefined {
  return resolveNullableStringOption(options.status, options.withoutStatus, 'status', 'without-status')
}

function resolveAssigneeFilter(options: BoardCardListOptions): string | null | undefined {
  return resolveNullableStringOption(options.assignee, options.withoutAssignee, 'assignee', 'without-assignee')
}

function resolveBoardCardMove(options: BoardCardMoveOptions): { beforeId?: string, afterId?: string, top?: boolean, bottom?: boolean } {
  const selected = [options.before !== undefined, options.after !== undefined, options.top === true, options.bottom === true]
    .filter(Boolean)
    .length

  if (selected !== 1) {
    throw new CliError('VALIDATION_ERROR', 'Provide exactly one of --before, --after, --top, or --bottom.', 4)
  }

  return {
    beforeId: options.before,
    afterId: options.after,
    top: options.top ? true : undefined,
    bottom: options.bottom ? true : undefined
  }
}

function resolveBoardColumnStatus(options: BoardColumnGetOptions): string | null {
  const resolved = resolveNullableStringOption(options.status, options.withoutStatus, 'status', 'without-status')

  if (resolved === undefined) {
    throw new CliError('VALIDATION_ERROR', 'Provide exactly one of --status or --without-status.', 4)
  }

  return resolved
}

function parseBoardCardCoverSize(value: string | undefined, flagName: string): 'small' | 'large' | undefined {
  if (value === undefined) {
    return undefined
  }

  if (value !== 'small' && value !== 'large') {
    throw new CliError('VALIDATION_ERROR', 'Invalid ' + flagName + ' value: ' + value, 4)
  }

  return value
}

function parseIdListOption(value: string | undefined, flagName: string): string[] | undefined {
  if (value === undefined) {
    return undefined
  }

  const parsed = value.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0)
  if (parsed.length === 0) {
    throw new CliError('VALIDATION_ERROR', 'Invalid ' + flagName + ' value: ' + value, 4)
  }

  return parsed
}

function resolveBoardCardCover(
  options: Pick<BoardCardCreateOptions, 'coverColor' | 'coverSize'>
): { color: number, size: 'small' | 'large' } | undefined
function resolveBoardCardCover(
  options: Pick<BoardCardUpdateOptions, 'coverColor' | 'coverSize' | 'clearCover'>,
  existingCover?: { color?: unknown, size?: unknown } | null
): { color: number, size: 'small' | 'large' } | null | undefined
function resolveBoardCardCover(
  options: Pick<BoardCardCreateOptions, 'coverColor' | 'coverSize'> | Pick<BoardCardUpdateOptions, 'coverColor' | 'coverSize' | 'clearCover'>,
  existingCover?: { color?: unknown, size?: unknown } | null
): { color: number, size: 'small' | 'large' } | null | undefined {
  const color = parseIntegerOption(options.coverColor, '--cover-color')
  const size = parseBoardCardCoverSize(options.coverSize, '--cover-size')
  const clearCover = 'clearCover' in options ? options.clearCover === true : false

  if (clearCover && (color !== undefined || size !== undefined)) {
    throw new CliError('VALIDATION_ERROR', 'Use only one of --clear-cover or the cover flags.', 4)
  }

  if (clearCover) {
    return null
  }

  if (color === undefined && size === undefined) {
    return undefined
  }

  const nextColor = color ?? (typeof existingCover?.color === 'number' ? existingCover.color : undefined)
  const nextSize = size ?? (existingCover?.size === 'small' || existingCover?.size === 'large' ? existingCover.size : undefined)

  if (nextColor === undefined || nextSize === undefined) {
    throw new CliError('VALIDATION_ERROR', 'Both --cover-color and --cover-size are required when the board card has no existing cover.', 4)
  }

  return {
    color: nextColor,
    size: nextSize
  }
}

export function registerBoardCommands(program: Command): void {
  const board = program.command('board').description('Board space commands')

  const list = board
    .command('list')
    .description('List boards')
    .option('--name <text>', 'Filter by exact board name')
    .option('--private', 'Filter to private boards')
    .option('--public', 'Filter to public boards')
    .option('--archived', 'Filter to archived boards')
    .option('--active', 'Filter to non-archived boards')

  handleCommand(list, async (options: BoardListOptions) => await withClient(async (client) => await listBoards(client, {
    name: options.name,
    private: resolvePrivate(options),
    archived: resolveArchivedFilter(options)
  })))

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
    .option('--color <number>', 'Board color index')
    .option('--background <text>', 'Board background identifier')
    .option('--private', 'Create the board as private')

  handleCommand(create, async (options: BoardCreateOptions) => {
    return await withClient(async (client) => await createBoard(client, {
      name: options.name,
      description: options.description,
      color: parseIntegerOption(options.color, '--color'),
      background: options.background,
      private: options.private
    }))
  })

  const update = board
    .command('update')
    .description('Update a board')
    .argument('<id>', 'Board id')
    .option('--name <name>', 'Board name')
    .option('--description <text>', 'Board description')
    .option('--color <number>', 'Board color index')
    .option('--clear-color', 'Remove the board color')
    .option('--background <text>', 'Board background identifier')
    .option('--clear-background', 'Remove the board background')
    .option('--private', 'Set the board to private')
    .option('--public', 'Set the board to public')
    .option('--archive', 'Archive the board')
    .option('--unarchive', 'Unarchive the board')

  handleCommand(update, async (id: string, options: BoardUpdateOptions) => {
    if (options.color !== undefined && options.clearColor) {
      throw new CliError('VALIDATION_ERROR', 'Use only one of --color or --clear-color.', 4)
    }

    if (options.background !== undefined && options.clearBackground) {
      throw new CliError('VALIDATION_ERROR', 'Use only one of --background or --clear-background.', 4)
    }

    return await withClient(async (client) => await updateBoard(client, id, {
      name: options.name,
      description: options.description,
      color: options.clearColor ? null : parseIntegerOption(options.color, '--color'),
      background: options.clearBackground ? null : options.background,
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

  const columnGet = column
    .command('get')
    .description('Get one board column derived from a board and status')
    .requiredOption('--board <id>', 'Board id')
    .option('--status <id>', 'Column status id')
    .option('--without-status', 'Select the column for cards without a status')
    .option('--cards-limit <n>', 'Maximum number of cards to include')

  handleCommand(columnGet, async (options: BoardColumnGetOptions) => {
    return await withClient(async (client) => await getBoardColumnSummary(client, {
      boardId: options.board,
      status: resolveBoardColumnStatus(options),
      cardsLimit: parseLimit(options.cardsLimit)
    }))
  })

  const card = board
    .command('card')
    .description('Board card commands')

  const cardList = card
    .command('list')
    .description('List board cards')
    .option('--board <id>', 'Filter by board id')
    .option('--title <text>', 'Filter by exact board card title')
    .option('--location <text>', 'Filter by exact board card location')
    .option('--status <id>', 'Filter by status id')
    .option('--without-status', 'Filter to cards without a status')
    .option('--assignee <id>', 'Filter by assignee person id')
    .option('--without-assignee', 'Filter to cards without an assignee')
    .option('--member <id>', 'Filter by member employee id')
    .option('--archived', 'Filter to archived board cards')
    .option('--active', 'Filter to non-archived board cards')
    .option('--limit <n>', 'Maximum number of board cards')

  handleCommand(cardList, async (options: BoardCardListOptions) => {
    return await withClient(async (client) => await listBoardCards(client, {
      boardId: options.board,
      title: options.title,
      location: options.location,
      status: resolveStatusFilter(options),
      assigneeId: resolveAssigneeFilter(options),
      memberId: options.member,
      archived: resolveArchivedFilter(options),
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
    .option('--cover-color <number>', 'Board card cover color index')
    .option('--cover-size <size>', 'Board card cover size: small or large')
    .option('--members <ids>', 'Comma-separated board card member employee ids')
    .option('--status <id>', 'Board card status id')
    .option('--assignee <id>', 'Board card assignee person id')
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
      cover: resolveBoardCardCover(options),
      memberIds: parseIdListOption(options.members, '--members'),
      status: options.status,
      assigneeId: options.assignee,
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
    .option('--cover-color <number>', 'Board card cover color index')
    .option('--cover-size <size>', 'Board card cover size: small or large')
    .option('--clear-cover', 'Remove the board card cover')
    .option('--members <ids>', 'Comma-separated board card member employee ids')
    .option('--clear-members', 'Remove all board card members')
    .option('--status <id>', 'Board card status id')
    .option('--clear-status', 'Remove the board card status')
    .option('--assignee <id>', 'Board card assignee person id')
    .option('--clear-assignee', 'Remove the board card assignee')
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

    return await withClient(async (client) => {
      const current = await getBoardCardSummary(client, id)

      if (options.members !== undefined && options.clearMembers) {
        throw new CliError('VALIDATION_ERROR', 'Use only one of --members or --clear-members.', 4)
      }

      return await updateBoardCard(client, id, {
        title: options.title,
        description,
        cover: resolveBoardCardCover(options, current.coverColor === null || current.coverSize === null
          ? null
          : {
              color: current.coverColor,
              size: current.coverSize
            }),
        memberIds: options.clearMembers ? null : parseIdListOption(options.members, '--members'),
        status: resolveNullableStringOption(options.status, options.clearStatus, 'status', 'clear-status'),
        assigneeId: resolveNullableStringOption(options.assignee, options.clearAssignee, 'assignee', 'clear-assignee'),
        location: resolveNullableStringOption(options.location, undefined, 'location'),
        startDate: resolveNullableStringOption(
          options.startDate === false ? false : parseIsoDate(options.startDate, '--start-date'),
          undefined,
          'start-date'
        ),
        dueDate: resolveNullableStringOption(
          options.dueDate === false ? false : parseIsoDate(options.dueDate, '--due-date'),
          undefined,
          'due-date'
        ),
        archived: resolveArchived(options)
      })
    })
  })

  const cardMove = card
    .command('move')
    .description('Move a board card within board order')
    .argument('<id>', 'Board card id')
    .option('--before <id>', 'Move before another board card id')
    .option('--after <id>', 'Move after another board card id')
    .option('--top', 'Move to the top of the board order')
    .option('--bottom', 'Move to the bottom of the board order')
    .option('--status <id>', 'Set the board card status while moving')
    .option('--clear-status', 'Clear the board card status while moving')

  handleCommand(cardMove, async (id: string, options: BoardCardMoveOptions) => {
    return await withClient(async (client) => await moveBoardCard(client, id, {
      ...resolveBoardCardMove(options),
      status: resolveNullableStringOption(options.status, options.clearStatus, 'status', 'clear-status')
    }))
  })

  const cardDelete = card
    .command('delete')
    .description('Delete a board card')
    .argument('<id>', 'Board card id')

  handleCommand(cardDelete, async (id: string) => await withClient(async (client) => await deleteBoardCard(client, id)))
}
