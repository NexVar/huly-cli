import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { readTextOption } from '../lib/files'
import { createDocument, deleteDocument, getDocumentSummary, listDocuments, updateDocument } from '../lib/huly'
import { CliError } from '../lib/output'

type DocumentListOptions = {
  teamspace: string
  limit?: string
  sort?: string
}

type DocumentCreateOptions = {
  teamspace: string
  title: string
  content?: string
  contentFile?: string
}

type DocumentUpdateOptions = {
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

export function registerDocumentCommands(program: Command): void {
  const doc = program.command('doc').description('Document commands')

  const list = doc
    .command('list')
    .description('List documents in a teamspace')
    .requiredOption('--teamspace <name>', 'Teamspace name')
    .option('--limit <n>', 'Maximum number of documents')
    .option('--sort <field>', 'Sort field; prefix with - for descending')

  handleCommand(list, async (options: DocumentListOptions) => {
    const limit = parseLimit(options.limit)
    return await withClient(async (client) => await listDocuments(client, {
      teamspaceName: options.teamspace,
      limit,
      sort: options.sort
    }))
  })

  const get = doc
    .command('get')
    .description('Get one document by id')
    .argument('<id>', 'Document id')

  handleCommand(get, async (id: string) => await withClient(async (client) => await getDocumentSummary(client, id)))

  const create = doc
    .command('create')
    .description('Create a new document')
    .requiredOption('--teamspace <name>', 'Teamspace name')
    .requiredOption('--title <title>', 'Document title')
    .option('--content <markdown>', 'Document markdown content')
    .option('--content-file <path>', 'Read document content from a file')

  handleCommand(create, async (options: DocumentCreateOptions) => {
    const content = await readTextOption(options.content, options.contentFile, 'content')

    return await withClient(async (client) => await createDocument(client, {
      teamspaceName: options.teamspace,
      title: options.title,
      content
    }))
  })

  const update = doc
    .command('update')
    .description('Update an existing document')
    .argument('<id>', 'Document id')
    .option('--title <title>', 'Document title')
    .option('--content <markdown>', 'Document markdown content')
    .option('--content-file <path>', 'Read document content from a file')

  handleCommand(update, async (id: string, options: DocumentUpdateOptions) => {
    const content = await readTextOption(options.content, options.contentFile, 'content')

    return await withClient(async (client) => await updateDocument(client, id, {
      title: options.title,
      content
    }))
  })

  const remove = doc
    .command('delete')
    .description('Delete a document')
    .argument('<id>', 'Document id')

  handleCommand(remove, async (id: string) => await withClient(async (client) => await deleteDocument(client, id)))
}
