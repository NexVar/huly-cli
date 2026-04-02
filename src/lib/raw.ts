import type { AttachedData, AttachedDoc, Class, Data, Doc, DocumentUpdate, FindOptions, Ref, Space } from '@hcengineering/core'
import type { HulyClient } from './client'
import { CliError } from './output'

type JsonObject = Record<string, unknown>

type RawOperationResult = {
  operation: 'create' | 'update' | 'delete' | 'add-collection'
  space?: string
  attachedTo?: string
  attachedToClass?: string
  collection?: string
}

type RawMutationResponse = {
  id: string
  class: string
  result: RawOperationResult
  tx?: unknown
}

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseJsonFlag(value: string, flagName: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    throw new CliError('VALIDATION_ERROR', `Invalid ${flagName} value: expected valid JSON.`, 4)
  }
}

function requireJsonObject(value: unknown, flagName: string): JsonObject {
  if (!isJsonObject(value)) {
    throw new CliError('VALIDATION_ERROR', `Invalid ${flagName} value: expected JSON object.`, 4)
  }

  return value
}

function extractTx(value: unknown): unknown {
  if (!isJsonObject(value)) {
    return undefined
  }

  if ('tx' in value) {
    return value.tx
  }

  return Object.keys(value).length > 0 ? value : undefined
}

export function parseOptionalJsonObjectFlag(value: string | undefined, flagName: string): JsonObject | undefined {
  if (value === undefined) {
    return undefined
  }

  return requireJsonObject(parseJsonFlag(value, flagName), flagName)
}

export function parseRequiredJsonObjectFlag(value: string, flagName: string): JsonObject {
  return requireJsonObject(parseJsonFlag(value, flagName), flagName)
}

export function requireFlagValue(value: string | undefined, flagName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CliError('VALIDATION_ERROR', `${flagName} is required.`, 4)
  }

  return value
}

export async function listRawDocuments(
  client: HulyClient,
  className: string,
  query: JsonObject | undefined,
  options: JsonObject | undefined
): Promise<unknown[]> {
  return await client.findAll(
    className as Ref<Class<Doc>>,
    (query ?? {}) as never,
    options as FindOptions<Doc> | undefined
  ) as unknown[]
}

export async function getRawDocument(client: HulyClient, className: string, id: string): Promise<unknown> {
  const doc = await client.findOne(
    className as Ref<Class<Doc>>,
    { _id: id as never }
  )

  if (!doc) {
    throw new CliError('NOT_FOUND', `Document '${id}' not found in class '${className}'.`, 3)
  }

  return doc
}

export async function createRawDocument(
  client: HulyClient,
  className: string,
  space: string,
  data: JsonObject,
  id?: string
): Promise<RawMutationResponse> {
  const createdId = await client.createDoc(
    className as Ref<Class<Doc>>,
    space as Ref<Space>,
    data as Data<Doc>,
    id as Ref<Doc> | undefined
  )

  return {
    id: createdId as string,
    class: className,
    result: {
      operation: 'create',
      space
    }
  }
}

export async function updateRawDocument(
  client: HulyClient,
  className: string,
  space: string,
  id: string,
  operations: JsonObject
): Promise<RawMutationResponse> {
  const operationResult = await client.updateDoc(
    className as Ref<Class<Doc>>,
    space as Ref<Space>,
    id as Ref<Doc>,
    operations as DocumentUpdate<Doc>
  )
  const tx = extractTx(operationResult)

  return {
    id,
    class: className,
    result: {
      operation: 'update',
      space
    },
    ...(tx === undefined ? {} : { tx })
  }
}

export async function deleteRawDocument(
  client: HulyClient,
  className: string,
  space: string,
  id: string
): Promise<RawMutationResponse> {
  const operationResult = await client.removeDoc(
    className as Ref<Class<Doc>>,
    space as Ref<Space>,
    id as Ref<Doc>
  )
  const tx = extractTx(operationResult)

  return {
    id,
    class: className,
    result: {
      operation: 'delete',
      space
    },
    ...(tx === undefined ? {} : { tx })
  }
}

export async function addRawCollectionDocument(
  client: HulyClient,
  className: string,
  space: string,
  attachedTo: string,
  attachedToClass: string,
  collection: string,
  data: JsonObject,
  id?: string
): Promise<RawMutationResponse> {
  const createdId = await client.addCollection(
    className as Ref<Class<AttachedDoc>>,
    space as Ref<Space>,
    attachedTo as Ref<Doc>,
    attachedToClass as Ref<Class<Doc>>,
    collection,
    data as AttachedData<AttachedDoc>,
    id as Ref<AttachedDoc> | undefined
  )

  return {
    id: createdId as string,
    class: className,
    result: {
      operation: 'add-collection',
      space,
      attachedTo,
      attachedToClass,
      collection
    }
  }
}
