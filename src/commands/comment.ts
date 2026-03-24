import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { readTextOption } from '../lib/files'
import { addComment, listComments } from '../lib/huly'
import { CliError } from '../lib/output'

type CommentListOptions = {
  on: string
}

type CommentAddOptions = {
  on: string
  message?: string
  messageFile?: string
}

export function registerCommentCommands(program: Command): void {
  const comment = program.command('comment').description('Comment commands')

  const list = comment
    .command('list')
    .description('List comments on an issue or document')
    .requiredOption('--on <issue-identifier|doc-id>', 'Issue identifier or document id')

  handleCommand(list, async (options: CommentListOptions) => {
    return await withClient(async (client) => await listComments(client, options.on))
  })

  const add = comment
    .command('add')
    .description('Add a comment to an issue or document')
    .requiredOption('--on <issue-identifier|doc-id>', 'Issue identifier or document id')
    .option('--message <text>', 'Comment message')
    .option('--message-file <path>', 'Read comment message from a file')

  handleCommand(add, async (options: CommentAddOptions) => {
    const message = await readTextOption(options.message, options.messageFile, 'message')

    if (message === undefined) {
      throw new CliError('VALIDATION_ERROR', 'Either --message or --message-file is required.', 4)
    }

    return await withClient(async (client) => await addComment(client, {
      on: options.on,
      message
    }))
  })
}
