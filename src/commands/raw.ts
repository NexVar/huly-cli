import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import {
  addRawCollectionDocument,
  createRawDocument,
  deleteRawDocument,
  getRawDocument,
  listRawDocuments,
  parseOptionalJsonObjectFlag,
  parseRequiredJsonObjectFlag,
  requireFlagValue,
  updateRawDocument
} from '../lib/raw'

type RawListOptions = {
  class: string
  query?: string
  options?: string
}

type RawGetOptions = {
  class: string
  id: string
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

export function registerRawCommands(program: Command): void {
  const raw = program.command('raw').description('Generic raw API commands')

  const list = raw
    .command('list')
    .description('List raw documents for a class')
    .option('--class <class>', 'Class reference')
    .option('--query <json>', 'JSON query object')
    .option('--options <json>', 'JSON find options object')

  handleCommand(list, async (options: RawListOptions) => {
    const query = parseOptionalJsonObjectFlag(options.query, '--query')
    const findOptions = parseOptionalJsonObjectFlag(options.options, '--options')
    const className = requireFlagValue(options.class, '--class')

    return await withClient(async (client) => await listRawDocuments(
      client,
      className,
      query,
      findOptions
    ))
  })

  const get = raw
    .command('get')
    .description('Get one raw document by class and id')
    .option('--class <class>', 'Class reference')
    .option('--id <id>', 'Document id')

  handleCommand(get, async (options: RawGetOptions) => {
    const className = requireFlagValue(options.class, '--class')
    const id = requireFlagValue(options.id, '--id')

    return await withClient(async (client) => await getRawDocument(
      client,
      className,
      id
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
}
