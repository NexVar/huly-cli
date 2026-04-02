import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import {
  archiveNotification,
  getNotificationSummary,
  listNotifications,
  readNotification,
  unarchiveNotification,
  unreadNotification
} from '../lib/huly'
import { CliError } from '../lib/output'

type NotificationListOptions = {
  limit?: string
  read?: boolean
  unread?: boolean
  archived?: boolean
  active?: boolean
  className?: string
  objectClass?: string
  objectId?: string
  type?: string
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

function parseListFilters(options: NotificationListOptions): {
  limit?: number
  isViewed?: boolean
  archived?: boolean
  className?: string
  objectClass?: string
  objectId?: string
  type?: string
} {
  if (options.read && options.unread) {
    throw new CliError('VALIDATION_ERROR', 'Use only one of --read or --unread.', 4)
  }

  if (options.archived && options.active) {
    throw new CliError('VALIDATION_ERROR', 'Use only one of --archived or --active.', 4)
  }

  return {
    limit: parseLimit(options.limit),
    ...(options.read ? { isViewed: true } : {}),
    ...(options.unread ? { isViewed: false } : {}),
    ...(options.archived ? { archived: true } : {}),
    ...(options.active ? { archived: false } : {}),
    ...(options.className === undefined ? {} : { className: options.className }),
    ...(options.objectClass === undefined ? {} : { objectClass: options.objectClass }),
    ...(options.objectId === undefined ? {} : { objectId: options.objectId }),
    ...(options.type === undefined ? {} : { type: options.type })
  }
}

export function registerNotificationCommands(program: Command): void {
  const notification = program.command('notification').description('Notification commands')

  const list = notification
    .command('list')
    .description('List inbox notifications for the current account')
    .option('--limit <n>', 'Maximum number of notifications')
    .option('--read', 'Only show read notifications')
    .option('--unread', 'Only show unread notifications')
    .option('--archived', 'Only show archived notifications')
    .option('--active', 'Only show non-archived notifications')
    .option('--class <id>', 'Filter by exact notification class id')
    .option('--object-class <id>', 'Filter by exact object class id')
    .option('--object-id <id>', 'Filter by exact object id')
    .option('--type <id>', 'Filter by exact notification type id')

  handleCommand(list, async (options: NotificationListOptions) => {
    return await withClient(async (client) => await listNotifications(client, parseListFilters(options)))
  })

  const get = notification
    .command('get')
    .description('Get a notification by id')
    .argument('<id>', 'Notification id')

  handleCommand(get, async (id: string) => await withClient(async (client) => await getNotificationSummary(client, id)))

  const read = notification
    .command('read')
    .description('Mark a notification as read')
    .argument('<id>', 'Notification id')

  handleCommand(read, async (id: string) => await withClient(async (client) => await readNotification(client, id)))

  const unread = notification
    .command('unread')
    .description('Mark a notification as unread')
    .argument('<id>', 'Notification id')

  handleCommand(unread, async (id: string) => await withClient(async (client) => await unreadNotification(client, id)))

  const archive = notification
    .command('archive')
    .description('Archive a notification')
    .argument('<id>', 'Notification id')

  handleCommand(archive, async (id: string) => await withClient(async (client) => await archiveNotification(client, id)))

  const unarchive = notification
    .command('unarchive')
    .description('Unarchive a notification')
    .argument('<id>', 'Notification id')

  handleCommand(unarchive, async (id: string) => await withClient(async (client) => await unarchiveNotification(client, id)))
}
