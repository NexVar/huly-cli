import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { readTextOption } from '../lib/files'
import {
  addChatMembers,
  createDirectChat,
  createChatChannel,
  createChatMessage,
  createThreadMessage,
  deleteChatChannel,
  deleteChatMessage,
  deleteThreadMessage,
  getDirectChatSummary,
  getChatMessageSummary,
  getChatSpaceSummary,
  getThreadMessageSummary,
  listChatMembers,
  listChatMessages,
  listChatSpaces,
  listThreadMessages,
  removeChatMembers,
  updateChatChannel,
  updateChatMessage,
  updateThreadMessage
} from '../lib/huly'
import { CliError } from '../lib/output'

type ChatListOptions = {
  limit?: string
  includeDirect?: boolean
}

type ChatCreateOptions = {
  name: string
  topic?: string
  description?: string
  private?: boolean
  member?: string[]
}

type ChatUpdateOptions = {
  name?: string
  topic?: string
  description?: string
  private?: boolean
  public?: boolean
  archive?: boolean
  unarchive?: boolean
}

type ChatMessageListOptions = {
  chat: string
  limit?: string
}

type ChatMessageCreateOptions = {
  chat: string
  message?: string
  messageFile?: string
}

type ChatMessageUpdateOptions = {
  message?: string
  messageFile?: string
}

type ChatThreadListOptions = {
  limit?: string
}

type ChatThreadCreateOptions = {
  message?: string
  messageFile?: string
}

type ChatThreadUpdateOptions = {
  message?: string
  messageFile?: string
}

type ChatMemberMutateOptions = {
  member: string[]
}

type ChatDirectOptions = {
  member: string
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

function collectValues(value: string, previous: string[] = []): string[] {
  previous.push(value)
  return previous
}

function resolveVisibility(options: Pick<ChatUpdateOptions, 'private' | 'public'>): boolean | undefined {
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

function resolveArchivedState(options: Pick<ChatUpdateOptions, 'archive' | 'unarchive'>): boolean | undefined {
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

export function registerChatCommands(program: Command): void {
  const chat = program.command('chat').description('Chat channel and message commands')

  const list = chat
    .command('list')
    .description('List chat channels')
    .option('--include-direct', 'Include direct-message chats')
    .option('--limit <n>', 'Maximum number of chats')

  handleCommand(list, async (options: ChatListOptions) => {
    return await withClient(async (client) => await listChatSpaces(client, {
      includeDirect: options.includeDirect,
      limit: parseLimit(options.limit)
    }))
  })

  const get = chat
    .command('get')
    .description('Get one chat by id')
    .argument('<id>', 'Chat id')

  handleCommand(get, async (id: string) => await withClient(async (client) => await getChatSpaceSummary(client, id)))

  const create = chat
    .command('create')
    .description('Create a chat channel')
    .requiredOption('--name <name>', 'Channel name')
    .option('--topic <text>', 'Channel topic')
    .option('--description <text>', 'Channel description')
    .option('--private', 'Create the channel as private')
    .option('--member <email>', 'Add a member by email; may be repeated', collectValues, [])

  handleCommand(create, async (options: ChatCreateOptions) => {
    return await withClient(async (client) => await createChatChannel(client, {
      name: options.name,
      topic: options.topic,
      description: options.description,
      private: options.private,
      memberEmails: options.member
    }))
  })

  const update = chat
    .command('update')
    .description('Update a chat channel')
    .argument('<id>', 'Chat channel id')
    .option('--name <name>', 'Channel name')
    .option('--topic <text>', 'Channel topic')
    .option('--description <text>', 'Channel description')
    .option('--private', 'Set the channel to private')
    .option('--public', 'Set the channel to public')
    .option('--archive', 'Archive the channel')
    .option('--unarchive', 'Unarchive the channel')

  handleCommand(update, async (id: string, options: ChatUpdateOptions) => {
    return await withClient(async (client) => await updateChatChannel(client, id, {
      name: options.name,
      topic: options.topic,
      description: options.description,
      private: resolveVisibility(options),
      archived: resolveArchivedState(options)
    }))
  })

  const remove = chat
    .command('delete')
    .description('Delete a chat channel')
    .argument('<id>', 'Chat channel id')

  handleCommand(remove, async (id: string) => await withClient(async (client) => await deleteChatChannel(client, id)))

  const member = chat.command('member').description('Chat channel member commands')

  const memberList = member
    .command('list')
    .description('List members in a chat channel')
    .argument('<id>', 'Chat channel id')

  handleCommand(memberList, async (id: string) => await withClient(async (client) => await listChatMembers(client, id)))

  const memberAdd = member
    .command('add')
    .description('Add members to a chat channel')
    .argument('<id>', 'Chat channel id')
    .option('--member <email>', 'Add a member by email; may be repeated', collectValues, [])

  handleCommand(memberAdd, async (id: string, options: ChatMemberMutateOptions) => {
    if (options.member.length === 0) {
      throw new CliError('VALIDATION_ERROR', 'At least one --member value is required.', 4)
    }

    return await withClient(async (client) => await addChatMembers(client, id, options.member))
  })

  const memberRemove = member
    .command('remove')
    .description('Remove members from a chat channel')
    .argument('<id>', 'Chat channel id')
    .option('--member <email>', 'Remove a member by email; may be repeated', collectValues, [])

  handleCommand(memberRemove, async (id: string, options: ChatMemberMutateOptions) => {
    if (options.member.length === 0) {
      throw new CliError('VALIDATION_ERROR', 'At least one --member value is required.', 4)
    }

    return await withClient(async (client) => await removeChatMembers(client, id, options.member))
  })

  const direct = chat.command('direct').description('Direct-message chat commands')

  const directGet = direct
    .command('get')
    .description('Get an existing direct-message chat by member email')
    .requiredOption('--member <email>', 'Workspace member email')

  handleCommand(directGet, async (options: ChatDirectOptions) => {
    return await withClient(async (client) => await getDirectChatSummary(client, options.member))
  })

  const directCreate = direct
    .command('create')
    .description('Create or return a direct-message chat by member email')
    .requiredOption('--member <email>', 'Workspace member email')

  handleCommand(directCreate, async (options: ChatDirectOptions) => {
    return await withClient(async (client) => await createDirectChat(client, options.member))
  })

  const message = chat.command('message').description('Chat message commands')

  const messageList = message
    .command('list')
    .description('List messages in a chat')
    .requiredOption('--chat <id>', 'Chat id')
    .option('--limit <n>', 'Maximum number of messages')

  handleCommand(messageList, async (options: ChatMessageListOptions) => {
    return await withClient(async (client) => await listChatMessages(client, {
      chatId: options.chat,
      limit: parseLimit(options.limit)
    }))
  })

  const messageGet = message
    .command('get')
    .description('Get one chat message by id')
    .argument('<id>', 'Chat message id')

  handleCommand(messageGet, async (id: string) => await withClient(async (client) => await getChatMessageSummary(client, id)))

  const send = message
    .command('send')
    .description('Send a message to a chat')
    .requiredOption('--chat <id>', 'Chat id')
    .option('--message <text>', 'Message markdown')
    .option('--message-file <path>', 'Read message markdown from a file')

  handleCommand(send, async (options: ChatMessageCreateOptions) => {
    const messageText = await readTextOption(options.message, options.messageFile, 'message')

    if (messageText === undefined) {
      throw new CliError('VALIDATION_ERROR', 'Either --message or --message-file is required.', 4)
    }

    return await withClient(async (client) => await createChatMessage(client, {
      chatId: options.chat,
      message: messageText
    }))
  })

  const messageUpdate = message
    .command('update')
    .description('Update an existing chat message')
    .argument('<id>', 'Chat message id')
    .option('--message <text>', 'Message markdown')
    .option('--message-file <path>', 'Read message markdown from a file')

  handleCommand(messageUpdate, async (id: string, options: ChatMessageUpdateOptions) => {
    const messageText = await readTextOption(options.message, options.messageFile, 'message')

    return await withClient(async (client) => await updateChatMessage(client, id, {
      message: messageText
    }))
  })

  const messageDelete = message
    .command('delete')
    .description('Delete a chat message')
    .argument('<id>', 'Chat message id')

  handleCommand(messageDelete, async (id: string) => await withClient(async (client) => await deleteChatMessage(client, id)))

  const thread = chat.command('thread').description('Chat thread reply commands')

  const threadList = thread
    .command('list')
    .description('List thread replies on a chat message')
    .argument('<message-id>', 'Parent chat message id')
    .option('--limit <n>', 'Maximum number of thread replies')

  handleCommand(threadList, async (messageId: string, options: ChatThreadListOptions) => {
    return await withClient(async (client) => await listThreadMessages(client, {
      parentMessageId: messageId,
      limit: parseLimit(options.limit)
    }))
  })

  const threadGet = thread
    .command('get')
    .description('Get one thread reply by id')
    .argument('<id>', 'Thread reply id')

  handleCommand(threadGet, async (id: string) => await withClient(async (client) => await getThreadMessageSummary(client, id)))

  const threadSend = thread
    .command('send')
    .description('Send a thread reply to a chat message')
    .argument('<message-id>', 'Parent chat message id')
    .option('--message <text>', 'Reply markdown')
    .option('--message-file <path>', 'Read reply markdown from a file')

  handleCommand(threadSend, async (messageId: string, options: ChatThreadCreateOptions) => {
    const messageText = await readTextOption(options.message, options.messageFile, 'message')

    if (messageText === undefined) {
      throw new CliError('VALIDATION_ERROR', 'Either --message or --message-file is required.', 4)
    }

    return await withClient(async (client) => await createThreadMessage(client, {
      parentMessageId: messageId,
      message: messageText
    }))
  })

  const threadUpdate = thread
    .command('update')
    .description('Update an existing thread reply')
    .argument('<id>', 'Thread reply id')
    .option('--message <text>', 'Reply markdown')
    .option('--message-file <path>', 'Read reply markdown from a file')

  handleCommand(threadUpdate, async (id: string, options: ChatThreadUpdateOptions) => {
    const messageText = await readTextOption(options.message, options.messageFile, 'message')

    return await withClient(async (client) => await updateThreadMessage(client, id, {
      message: messageText
    }))
  })

  const threadDelete = thread
    .command('delete')
    .description('Delete a thread reply')
    .argument('<id>', 'Thread reply id')

  handleCommand(threadDelete, async (id: string) => await withClient(async (client) => await deleteThreadMessage(client, id)))
}
