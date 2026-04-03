import { MarkupContent, type MarkupFormat } from '@hcengineering/api-client'
import type { AttachedData, AttachedDoc, Class, Data, Doc, DocumentUpdate, FindOptions, Mixin, MixinData, MixinUpdate, Ref, Space } from '@hcengineering/core'
import type { HulyClient } from './client'
import { CliError } from './output'

type JsonObject = Record<string, unknown>
type RawMarkupField = {
  field: string
  format: MarkupFormat
}

type RawOperationResult = {
  operation: 'create' | 'update' | 'delete' | 'add-collection' | 'update-collection' | 'remove-collection' | 'create-mixin' | 'update-mixin'
  space?: string
  attachedTo?: string
  attachedToClass?: string
  collection?: string
  objectId?: string
  objectClass?: string
  mixin?: string
}

type RawMutationResponse = {
  id: string
  class: string
  result: RawOperationResult
  tx?: unknown
}

type RawMarkupPayload = {
  objectId: string
  objectClass: string
  attribute: string
  format: MarkupFormat
  ref?: string
  content?: string
  attached?: boolean
  space?: string
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

function isMarkupFormat(value: string): value is MarkupFormat {
  return value === 'markdown' || value === 'html' || value === 'markup'
}

export function parseRawMarkupFieldsFlag(value: string | undefined): RawMarkupField[] {
  if (value === undefined) {
    return []
  }

  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  if (entries.length === 0) {
    throw new CliError('VALIDATION_ERROR', 'Invalid --markup-fields value: expected one or more field names.', 4)
  }

  return entries.map((entry) => {
    const [field, formatCandidate] = entry.split(':', 2)

    if (field === undefined || field.trim() === '') {
      throw new CliError('VALIDATION_ERROR', `Invalid --markup-fields entry '${entry}': field name is required.`, 4)
    }

    const format = formatCandidate?.trim() ?? 'markdown'
    if (!isMarkupFormat(format)) {
      throw new CliError('VALIDATION_ERROR', `Invalid --markup-fields entry '${entry}': format must be markdown, html, or markup.`, 4)
    }

    return {
      field: field.trim(),
      format
    }
  })
}

export function parseMarkupFormatFlag(value: string | undefined, flagName: string): MarkupFormat {
  const format = value ?? 'markdown'

  if (!isMarkupFormat(format)) {
    throw new CliError('VALIDATION_ERROR', `Invalid ${flagName} value: expected one of "markdown", "html", or "markup".`, 4)
  }

  return format
}

function toMarkupContent(value: unknown, flagName: string, path: string): MarkupContent {
  if (!isJsonObject(value)) {
    throw new CliError('VALIDATION_ERROR', `Invalid ${flagName} value${path}: expected "$markup" to be an object.`, 4)
  }

  const content = value.content
  const format = value.format ?? 'markdown'

  if (typeof content !== 'string') {
    throw new CliError('VALIDATION_ERROR', `Invalid ${flagName} value${path}: expected "$markup.content" to be a string.`, 4)
  }

  if (typeof format !== 'string' || !isMarkupFormat(format)) {
    throw new CliError('VALIDATION_ERROR', `Invalid ${flagName} value${path}: expected "$markup.format" to be one of "markdown", "html", or "markup".`, 4)
  }

  return new MarkupContent(content, format)
}

function transformMarkupValues(value: unknown, flagName: string, path = ''): unknown {
  if (Array.isArray(value)) {
    return value.map((entry, index) => transformMarkupValues(entry, flagName, `${path}[${index}]`))
  }

  if (!isJsonObject(value)) {
    return value
  }

  if ('$markup' in value) {
    return toMarkupContent(value.$markup, flagName, path)
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      transformMarkupValues(entry, flagName, path === '' ? `.${key}` : `${path}.${key}`)
    ])
  )
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

  return requireJsonObject(transformMarkupValues(parseJsonFlag(value, flagName), flagName), flagName)
}

export function parseRequiredJsonObjectFlag(value: string, flagName: string): JsonObject {
  return requireJsonObject(transformMarkupValues(parseJsonFlag(value, flagName), flagName), flagName)
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
  options: JsonObject | undefined,
  markupFields: RawMarkupField[] = []
): Promise<unknown[]> {
  const docs = await client.findAll(
    className as Ref<Class<Doc>>,
    (query ?? {}) as never,
    options as FindOptions<Doc> | undefined
  ) as unknown[]

  if (markupFields.length === 0) {
    return docs
  }

  return await Promise.all(docs.map(async (doc) => await resolveRawMarkupFields(client, className, doc, markupFields)))
}

export async function getRawDocument(
  client: HulyClient,
  className: string,
  id: string,
  markupFields: RawMarkupField[] = []
): Promise<unknown> {
  const doc = await client.findOne(
    className as Ref<Class<Doc>>,
    { _id: id as never }
  )

  if (!doc) {
    throw new CliError('NOT_FOUND', `Document '${id}' not found in class '${className}'.`, 3)
  }

  if (markupFields.length === 0) {
    return doc
  }

  return await resolveRawMarkupFields(client, className, doc, markupFields)
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

export async function updateRawCollectionDocument(
  client: HulyClient,
  className: string,
  space: string,
  id: string,
  attachedTo: string,
  attachedToClass: string,
  collection: string,
  operations: JsonObject
): Promise<RawMutationResponse> {
  const parentId = await client.updateCollection(
    className as Ref<Class<AttachedDoc>>,
    space as Ref<Space>,
    id as Ref<AttachedDoc>,
    attachedTo as Ref<Doc>,
    attachedToClass as Ref<Class<Doc>>,
    collection,
    operations as DocumentUpdate<AttachedDoc>
  )

  return {
    id,
    class: className,
    result: {
      operation: 'update-collection',
      space,
      attachedTo: parentId as string,
      attachedToClass,
      collection
    }
  }
}

export async function removeRawCollectionDocument(
  client: HulyClient,
  className: string,
  space: string,
  id: string,
  attachedTo: string,
  attachedToClass: string,
  collection: string
): Promise<RawMutationResponse> {
  const parentId = await client.removeCollection(
    className as Ref<Class<AttachedDoc>>,
    space as Ref<Space>,
    id as Ref<AttachedDoc>,
    attachedTo as Ref<Doc>,
    attachedToClass as Ref<Class<Doc>>,
    collection
  )

  return {
    id,
    class: className,
    result: {
      operation: 'remove-collection',
      space,
      attachedTo: parentId as string,
      attachedToClass,
      collection
    }
  }
}

export async function createRawMixin(
  client: HulyClient,
  objectId: string,
  objectClass: string,
  objectSpace: string,
  mixin: string,
  data: JsonObject
): Promise<RawMutationResponse> {
  const operationResult = await client.createMixin(
    objectId as Ref<Doc>,
    objectClass as Ref<Class<Doc>>,
    objectSpace as Ref<Space>,
    mixin as Ref<Mixin<Doc>>,
    data as MixinData<Doc, Doc>
  )
  const tx = extractTx(operationResult)

  return {
    id: objectId,
    class: objectClass,
    result: {
      operation: 'create-mixin',
      space: objectSpace,
      objectId,
      objectClass,
      mixin
    },
    ...(tx === undefined ? {} : { tx })
  }
}

export async function updateRawMixin(
  client: HulyClient,
  objectId: string,
  objectClass: string,
  objectSpace: string,
  mixin: string,
  operations: JsonObject
): Promise<RawMutationResponse> {
  const operationResult = await client.updateMixin(
    objectId as Ref<Doc>,
    objectClass as Ref<Class<Doc>>,
    objectSpace as Ref<Space>,
    mixin as Ref<Mixin<Doc>>,
    operations as MixinUpdate<Doc, Doc>
  )
  const tx = extractTx(operationResult)

  return {
    id: objectId,
    class: objectClass,
    result: {
      operation: 'update-mixin',
      space: objectSpace,
      objectId,
      objectClass,
      mixin
    },
    ...(tx === undefined ? {} : { tx })
  }
}

async function resolveRawMarkupFields(
  client: HulyClient,
  className: string,
  doc: unknown,
  markupFields: RawMarkupField[]
): Promise<unknown> {
  if (!isJsonObject(doc)) {
    return doc
  }

  const objectId = doc._id
  if (typeof objectId !== 'string' || objectId.length === 0) {
    return doc
  }

  const resolved = { ...doc }

  await Promise.all(markupFields.map(async ({ field, format }) => {
    const value = doc[field]

    if (typeof value !== 'string' || value.length === 0) {
      return
    }

    resolved[field] = await client.fetchMarkup(
      className as Ref<Class<Doc>>,
      objectId as Ref<Doc>,
      field,
      value as never,
      format
    )
  }))

  return resolved
}

export async function fetchRawMarkup(
  client: HulyClient,
  objectClass: string,
  objectId: string,
  attribute: string,
  ref: string,
  format: MarkupFormat
): Promise<RawMarkupPayload> {
  const content = await client.fetchMarkup(
    objectClass as Ref<Class<Doc>>,
    objectId as Ref<Doc>,
    attribute,
    ref as never,
    format
  )

  return {
    objectId,
    objectClass,
    attribute,
    ref,
    format,
    content
  }
}

export async function uploadRawMarkup(
  client: HulyClient,
  objectClass: string,
  objectId: string,
  attribute: string,
  content: string,
  format: MarkupFormat,
  attachToField = true
): Promise<RawMarkupPayload> {
  let ref: string
  let space: string | undefined

  if (attachToField) {
    const object = await client.findOne(
      objectClass as Ref<Class<Doc>>,
      { _id: objectId as never }
    ) as Record<string, unknown> | undefined

    if (!object) {
      throw new CliError('NOT_FOUND', `Document '${objectId}' not found in class '${objectClass}'.`, 3)
    }

    if (typeof object.space !== 'string' || object.space.length === 0) {
      throw new CliError('VALIDATION_ERROR', `Unable to infer space for '${objectId}'. Use --upload-only to skip field attachment.`, 4)
    }

    space = object.space

    await client.updateDoc(
      objectClass as Ref<Class<Doc>>,
      space as Ref<Space>,
      objectId as Ref<Doc>,
      {
        [attribute]: new MarkupContent(content, format)
      } as DocumentUpdate<Doc>
    )

    const refreshed = await client.findOne(
      objectClass as Ref<Class<Doc>>,
      { _id: objectId as never }
    ) as Record<string, unknown> | undefined

    if (!refreshed || typeof refreshed[attribute] !== 'string' || refreshed[attribute].length === 0) {
      throw new CliError('GENERAL_ERROR', `Failed to resolve markup ref for '${attribute}' after attachment.`, 1)
    }

    ref = refreshed[attribute] as string
  } else {
    const uploadedRef = await client.uploadMarkup(
      objectClass as Ref<Class<Doc>>,
      objectId as Ref<Doc>,
      attribute,
      content,
      format
    )

    ref = uploadedRef as string
  }

  return {
    objectId,
    objectClass,
    attribute,
    format,
    ref,
    ...(attachToField ? { attached: true, space } : { attached: false })
  }
}
