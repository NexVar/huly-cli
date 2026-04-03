import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { readTextOption } from '../lib/files'
import {
  addRawCollectionDocument,
  createRawMixin,
  createRawDocument,
  deleteRawDocument,
  fetchRawMarkup,
  getRawDocument,
  listRawDocuments,
  parseRawMarkupFieldsFlag,
  parseMarkupFormatFlag,
  parseOptionalJsonObjectFlag,
  parseRequiredJsonObjectFlag,
  removeRawCollectionDocument,
  requireFlagValue,
  updateRawCollectionDocument,
  updateRawMixin,
  updateRawDocument,
  uploadRawMarkup
} from '../lib/raw'

type RawListOptions = {
  class: string
  query?: string
  options?: string
  markupFields?: string
}

type RawGetOptions = {
  class: string
  id: string
  markupFields?: string
}

type RawCreateOptions = {
  class: string
  space: string
  data: string
  id?: string
}

type RawUpdateOptions = {
  class: string
  space: string
  id: string
  operations: string
}

type RawDeleteOptions = {
  class: string
  space: string
  id: string
}

type RawAddCollectionOptions = {
  class: string
  space: string
  attachedTo: string
  attachedToClass: string
  collection: string
  data: string
  id?: string
}

type RawUpdateCollectionOptions = {
  class: string
  space: string
  id: string
  attachedTo: string
  attachedToClass: string
  collection: string
  operations: string
}

type RawRemoveCollectionOptions = {
  class: string
  space: string
  id: string
  attachedTo: string
  attachedToClass: string
  collection: string
}

type RawCreateMixinOptions = {
  objectId: string
  objectClass: string
  objectSpace: string
  mixin: string
  data: string
}

type RawUpdateMixinOptions = {
  objectId: string
  objectClass: string
  objectSpace: string
  mixin: string
  operations: string
}

type RawFetchMarkupOptions = {
  objectId: string
  objectClass: string
  attribute: string
  ref: string
  format?: string
}

type RawUploadMarkupOptions = {
  objectId: string
  objectClass: string
  attribute: string
  content?: string
  contentFile?: string
  format?: string
  uploadOnly?: boolean
}

export function registerRawCommands(program: Command): void {
  const raw = program.command('raw').description('Generic raw API commands')

  const list = raw
    .command('list')
    .description('List raw documents for a class')
    .option('--class <class>', 'Class reference')
    .option('--query <json>', 'JSON query object')
    .option('--options <json>', 'JSON find options object')
    .option('--markup-fields <fields>', 'Comma-separated markup fields to resolve, optionally field:format')

  handleCommand(list, async (options: RawListOptions) => {
    const query = parseOptionalJsonObjectFlag(options.query, '--query')
    const findOptions = parseOptionalJsonObjectFlag(options.options, '--options')
    const markupFields = parseRawMarkupFieldsFlag(options.markupFields)
    const className = requireFlagValue(options.class, '--class')

    return await withClient(async (client) => await listRawDocuments(
      client,
      className,
      query,
      findOptions,
      markupFields
    ))
  })

  const get = raw
    .command('get')
    .description('Get one raw document by class and id')
    .option('--class <class>', 'Class reference')
    .option('--id <id>', 'Document id')
    .option('--markup-fields <fields>', 'Comma-separated markup fields to resolve, optionally field:format')

  handleCommand(get, async (options: RawGetOptions) => {
    const className = requireFlagValue(options.class, '--class')
    const id = requireFlagValue(options.id, '--id')
    const markupFields = parseRawMarkupFieldsFlag(options.markupFields)

    return await withClient(async (client) => await getRawDocument(
      client,
      className,
      id,
      markupFields
    ))
  })

  const create = raw
    .command('create')
    .description('Create one raw document')
    .option('--class <class>', 'Class reference')
    .option('--space <space>', 'Space reference')
    .option('--data <json>', 'JSON data object')
    .option('--id <id>', 'Explicit document id')

  handleCommand(create, async (options: RawCreateOptions) => {
    const data = parseRequiredJsonObjectFlag(requireFlagValue(options.data, '--data'), '--data')
    const className = requireFlagValue(options.class, '--class')
    const space = requireFlagValue(options.space, '--space')

    return await withClient(async (client) => await createRawDocument(
      client,
      className,
      space,
      data,
      options.id
    ))
  })

  const update = raw
    .command('update')
    .description('Update one raw document')
    .option('--class <class>', 'Class reference')
    .option('--space <space>', 'Space reference')
    .option('--id <id>', 'Document id')
    .option('--operations <json>', 'JSON update operations object')

  handleCommand(update, async (options: RawUpdateOptions) => {
    const operations = parseRequiredJsonObjectFlag(requireFlagValue(options.operations, '--operations'), '--operations')
    const className = requireFlagValue(options.class, '--class')
    const space = requireFlagValue(options.space, '--space')
    const id = requireFlagValue(options.id, '--id')

    return await withClient(async (client) => await updateRawDocument(
      client,
      className,
      space,
      id,
      operations
    ))
  })

  const remove = raw
    .command('delete')
    .description('Delete one raw document')
    .option('--class <class>', 'Class reference')
    .option('--space <space>', 'Space reference')
    .option('--id <id>', 'Document id')

  handleCommand(remove, async (options: RawDeleteOptions) => {
    const className = requireFlagValue(options.class, '--class')
    const space = requireFlagValue(options.space, '--space')
    const id = requireFlagValue(options.id, '--id')

    return await withClient(async (client) => await deleteRawDocument(
      client,
      className,
      space,
      id
    ))
  })

  const addCollection = raw
    .command('add-collection')
    .description('Add one raw attached document to a collection')
    .option('--class <class>', 'Attached document class reference')
    .option('--space <space>', 'Space reference')
    .option('--attached-to <id>', 'Parent document id')
    .option('--attached-to-class <class>', 'Parent document class reference')
    .option('--collection <name>', 'Collection name')
    .option('--data <json>', 'JSON data object')
    .option('--id <id>', 'Explicit document id')

  handleCommand(addCollection, async (options: RawAddCollectionOptions) => {
    const data = parseRequiredJsonObjectFlag(requireFlagValue(options.data, '--data'), '--data')
    const className = requireFlagValue(options.class, '--class')
    const space = requireFlagValue(options.space, '--space')
    const attachedTo = requireFlagValue(options.attachedTo, '--attached-to')
    const attachedToClass = requireFlagValue(options.attachedToClass, '--attached-to-class')
    const collection = requireFlagValue(options.collection, '--collection')

    return await withClient(async (client) => await addRawCollectionDocument(
      client,
      className,
      space,
      attachedTo,
      attachedToClass,
      collection,
      data,
      options.id
    ))
  })

  const updateCollection = raw
    .command('update-collection')
    .description('Update one raw attached document in a collection')
    .option('--class <class>', 'Attached document class reference')
    .option('--space <space>', 'Space reference')
    .option('--id <id>', 'Attached document id')
    .option('--attached-to <id>', 'Parent document id')
    .option('--attached-to-class <class>', 'Parent document class reference')
    .option('--collection <name>', 'Collection name')
    .option('--operations <json>', 'JSON update operations object')

  handleCommand(updateCollection, async (options: RawUpdateCollectionOptions) => {
    const operations = parseRequiredJsonObjectFlag(requireFlagValue(options.operations, '--operations'), '--operations')
    const className = requireFlagValue(options.class, '--class')
    const space = requireFlagValue(options.space, '--space')
    const id = requireFlagValue(options.id, '--id')
    const attachedTo = requireFlagValue(options.attachedTo, '--attached-to')
    const attachedToClass = requireFlagValue(options.attachedToClass, '--attached-to-class')
    const collection = requireFlagValue(options.collection, '--collection')

    return await withClient(async (client) => await updateRawCollectionDocument(
      client,
      className,
      space,
      id,
      attachedTo,
      attachedToClass,
      collection,
      operations
    ))
  })

  const removeCollection = raw
    .command('remove-collection')
    .description('Remove one raw attached document from a collection')
    .option('--class <class>', 'Attached document class reference')
    .option('--space <space>', 'Space reference')
    .option('--id <id>', 'Attached document id')
    .option('--attached-to <id>', 'Parent document id')
    .option('--attached-to-class <class>', 'Parent document class reference')
    .option('--collection <name>', 'Collection name')

  handleCommand(removeCollection, async (options: RawRemoveCollectionOptions) => {
    const className = requireFlagValue(options.class, '--class')
    const space = requireFlagValue(options.space, '--space')
    const id = requireFlagValue(options.id, '--id')
    const attachedTo = requireFlagValue(options.attachedTo, '--attached-to')
    const attachedToClass = requireFlagValue(options.attachedToClass, '--attached-to-class')
    const collection = requireFlagValue(options.collection, '--collection')

    return await withClient(async (client) => await removeRawCollectionDocument(
      client,
      className,
      space,
      id,
      attachedTo,
      attachedToClass,
      collection
    ))
  })

  const createMixin = raw
    .command('create-mixin')
    .description('Create one raw mixin on an existing document')
    .option('--object-id <id>', 'Base document id')
    .option('--object-class <class>', 'Base document class reference')
    .option('--object-space <space>', 'Base document space reference')
    .option('--mixin <mixin>', 'Mixin reference')
    .option('--data <json>', 'JSON mixin data object')

  handleCommand(createMixin, async (options: RawCreateMixinOptions) => {
    const data = parseRequiredJsonObjectFlag(requireFlagValue(options.data, '--data'), '--data')
    const objectId = requireFlagValue(options.objectId, '--object-id')
    const objectClass = requireFlagValue(options.objectClass, '--object-class')
    const objectSpace = requireFlagValue(options.objectSpace, '--object-space')
    const mixin = requireFlagValue(options.mixin, '--mixin')

    return await withClient(async (client) => await createRawMixin(
      client,
      objectId,
      objectClass,
      objectSpace,
      mixin,
      data
    ))
  })

  const rawUpdateMixin = raw
    .command('update-mixin')
    .description('Update one raw mixin on an existing document')
    .option('--object-id <id>', 'Base document id')
    .option('--object-class <class>', 'Base document class reference')
    .option('--object-space <space>', 'Base document space reference')
    .option('--mixin <mixin>', 'Mixin reference')
    .option('--operations <json>', 'JSON mixin update operations object')

  handleCommand(rawUpdateMixin, async (options: RawUpdateMixinOptions) => {
    const operations = parseRequiredJsonObjectFlag(requireFlagValue(options.operations, '--operations'), '--operations')
    const objectId = requireFlagValue(options.objectId, '--object-id')
    const objectClass = requireFlagValue(options.objectClass, '--object-class')
    const objectSpace = requireFlagValue(options.objectSpace, '--object-space')
    const mixin = requireFlagValue(options.mixin, '--mixin')

    return await withClient(async (client) => await updateRawMixin(
      client,
      objectId,
      objectClass,
      objectSpace,
      mixin,
      operations
    ))
  })

  const fetchMarkup = raw
    .command('fetch-markup')
    .description('Fetch one raw markup field from an existing document')
    .option('--object-id <id>', 'Base document id')
    .option('--object-class <class>', 'Base document class reference')
    .option('--attribute <name>', 'Markup attribute name')
    .option('--ref <ref>', 'Markup blob reference')
    .option('--format <format>', 'Markup format: markdown, html, or markup')

  handleCommand(fetchMarkup, async (options: RawFetchMarkupOptions) => {
    const objectId = requireFlagValue(options.objectId, '--object-id')
    const objectClass = requireFlagValue(options.objectClass, '--object-class')
    const attribute = requireFlagValue(options.attribute, '--attribute')
    const ref = requireFlagValue(options.ref, '--ref')
    const format = parseMarkupFormatFlag(options.format, '--format')

    return await withClient(async (client) => await fetchRawMarkup(
      client,
      objectClass,
      objectId,
      attribute,
      ref,
      format
    ))
  })

  const uploadMarkup = raw
    .command('upload-markup')
    .description('Upload one raw markup field for an existing document')
    .option('--object-id <id>', 'Base document id')
    .option('--object-class <class>', 'Base document class reference')
    .option('--attribute <name>', 'Markup attribute name')
    .option('--content <text>', 'Markup content text')
    .option('--content-file <path>', 'Read markup content from a file')
    .option('--format <format>', 'Markup format: markdown, html, or markup')
    .option('--upload-only', 'Only create a markup ref without attaching it back to the document field')

  handleCommand(uploadMarkup, async (options: RawUploadMarkupOptions) => {
    const objectId = requireFlagValue(options.objectId, '--object-id')
    const objectClass = requireFlagValue(options.objectClass, '--object-class')
    const attribute = requireFlagValue(options.attribute, '--attribute')
    const content = await readTextOption(options.content, options.contentFile, 'content')
    const format = parseMarkupFormatFlag(options.format, '--format')

    return await withClient(async (client) => await uploadRawMarkup(
      client,
      objectClass,
      objectId,
      attribute,
      requireFlagValue(content, '--content or --content-file'),
      format,
      !options.uploadOnly
    ))
  })
}
