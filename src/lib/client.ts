import {
  createRestClient,
  createRestTxOperations,
  loadServerConfig,
  MarkupContent
} from '@hcengineering/api-client'
import { getClient as getCollaboratorClient } from '@hcengineering/collaborator-client'
import { generateId, makeCollabId, type Account, type Class, type Doc, type FindOptions, type FindResult, type ModelDb, type Ref, type WithLookup, type TxResult, type Space, type Data, type DocumentUpdate, type AttachedDoc, type AttachedData, type Hierarchy, type TxOperations, type Mixin, type MixinData, type MixinUpdate } from '@hcengineering/core'
import { htmlToJSON, jsonToMarkup } from '@hcengineering/text'
import { markdownToMarkup } from '@hcengineering/text-markdown'
import { resolveAuthConfig } from './config'
import { createMarkupOperations } from './markup'
import { CliError } from './output'
import { retry } from './retry'
import type { AuthConfig } from './types'

const CONNECT_RETRIES = 4
const CONNECT_RETRY_DELAY_MS = 400

async function withSuppressedBootstrapNoise<T>(fn: () => Promise<T>): Promise<T> {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout)
  const originalStderrWrite = process.stderr.write.bind(process.stderr)
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error
  }

  process.stdout.write = ((..._args: any[]) => true) as typeof process.stdout.write
  process.stderr.write = ((..._args: any[]) => true) as typeof process.stderr.write
  console.log = () => {}
  console.info = () => {}
  console.warn = () => {}
  console.error = () => {}

  try {
    return await fn()
  } finally {
    process.stdout.write = originalStdoutWrite
    process.stderr.write = originalStderrWrite
    console.log = originalConsole.log
    console.info = originalConsole.info
    console.warn = originalConsole.warn
    console.error = originalConsole.error
  }
}

export type HulyClient = {
  getHierarchy: () => Hierarchy
  getModel: () => ModelDb
  getAccount: () => Promise<Account>
  findAll: <T extends Doc>(_class: Ref<Class<T>>, query: any, options?: FindOptions<T>) => Promise<FindResult<T>>
  findOne: <T extends Doc>(_class: Ref<Class<T>>, query: any, options?: FindOptions<T>) => Promise<WithLookup<T> | undefined>
  createDoc: <T extends Doc>(_class: Ref<Class<T>>, space: Ref<Space>, attributes: Data<T>, id?: Ref<T>) => Promise<Ref<T>>
  updateDoc: <T extends Doc>(_class: Ref<Class<T>>, space: Ref<Space>, objectId: Ref<T>, operations: DocumentUpdate<T>, retrieve?: boolean) => Promise<TxResult>
  removeDoc: <T extends Doc>(_class: Ref<Class<T>>, space: Ref<Space>, objectId: Ref<T>) => Promise<TxResult>
  addCollection: <T extends Doc, P extends AttachedDoc>(
    _class: Ref<Class<P>>,
    space: Ref<Space>,
    attachedTo: Ref<T>,
    attachedToClass: Ref<Class<T>>,
    collection: Extract<keyof T, string> | string,
    attributes: AttachedData<P>,
    id?: Ref<P>
  ) => Promise<Ref<P>>
  updateCollection: <T extends Doc, P extends AttachedDoc>(
    _class: Ref<Class<P>>,
    space: Ref<Space>,
    objectId: Ref<P>,
    attachedTo: Ref<T>,
    attachedToClass: Ref<Class<T>>,
    collection: Extract<keyof T, string> | string,
    operations: DocumentUpdate<P>,
    retrieve?: boolean
  ) => Promise<Ref<T>>
  removeCollection: <T extends Doc, P extends AttachedDoc>(
    _class: Ref<Class<P>>,
    space: Ref<Space>,
    objectId: Ref<P>,
    attachedTo: Ref<T>,
    attachedToClass: Ref<Class<T>>,
    collection: Extract<keyof T, string> | string
  ) => Promise<Ref<T>>
  createMixin: <D extends Doc, M extends D>(
    objectId: Ref<D>,
    objectClass: Ref<Class<D>>,
    objectSpace: Ref<Space>,
    mixin: Ref<Mixin<M>>,
    attributes: MixinData<D, M>
  ) => Promise<TxResult>
  updateMixin: <D extends Doc, M extends D>(
    objectId: Ref<D>,
    objectClass: Ref<Class<D>>,
    objectSpace: Ref<Space>,
    mixin: Ref<Mixin<M>>,
    attributes: MixinUpdate<D, M>
  ) => Promise<TxResult>
  fetchMarkup: (...args: Parameters<ReturnType<typeof createMarkupOperations>['fetchMarkup']>) => Promise<string>
  uploadMarkup: (...args: Parameters<ReturnType<typeof createMarkupOperations>['uploadMarkup']>) => Promise<any>
  close: () => Promise<void>
}

function isAuthErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return normalized.includes('auth') || normalized.includes('password') || normalized.includes('401') || normalized.includes('403')
}

function isRetryableConnectionError(error: unknown): boolean {
  if (error instanceof CliError) {
    return error.code === 'CONNECTION_ERROR'
  }

  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  const retryableMarkers = [
    'fetch failed',
    'network',
    'timeout',
    'timed out',
    'econnreset',
    'econnrefused',
    'enotfound',
    'eai_again',
    'socket hang up',
    'service unavailable',
    'temporarily unavailable',
    '502',
    '503',
    '504'
  ]

  return retryableMarkers.some((marker) => message.includes(marker))
}

function getTimezoneHeader(): Record<string, string> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return typeof timezone === 'string' && timezone.length > 0
    ? { 'x-timezone': timezone }
    : {}
}

async function callAccountRpc<T>(
  accountsUrl: string,
  method: string,
  params: Record<string, unknown>,
  token?: string
): Promise<T> {
  const response = await fetch(accountsUrl, {
    keepalive: true,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Connection: 'keep-alive',
      ...getTimezoneHeader(),
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` })
    },
    body: JSON.stringify({ method, params })
  })

  const payload = await response.json() as {
    result?: T
    error?: unknown
  }

  if (payload.error !== undefined) {
    throw new Error(`Account RPC ${method} failed: ${JSON.stringify(payload.error)}`)
  }

  if (payload.result === undefined) {
    throw new Error(`Account RPC ${method} returned no result`)
  }

  return payload.result
}

async function resolveWorkspaceToken(
  resolvedConfig: AuthConfig,
  accountsUrl: string
): Promise<{ endpoint: string, token: string, workspaceId: string }> {
  let accountToken = resolvedConfig.token

  if (accountToken === undefined) {
    const login = await callAccountRpc<{ token?: string }>(
      accountsUrl,
      'login',
      {
        email: resolvedConfig.email,
        password: resolvedConfig.password
      }
    )

    if (typeof login.token !== 'string' || login.token.length === 0) {
      throw new Error('Login failed')
    }

    accountToken = login.token
  }

  const workspace = await callAccountRpc<{
    endpoint?: string
    token?: string
    workspace?: string
  }>(
    accountsUrl,
    'selectWorkspace',
    {
      workspaceUrl: resolvedConfig.workspace,
      kind: 'external',
      externalRegions: []
    },
    accountToken
  )

  if (typeof workspace.endpoint !== 'string' || workspace.endpoint.length === 0) {
    throw new Error('Workspace endpoint was not returned')
  }

  if (typeof workspace.token !== 'string' || workspace.token.length === 0) {
    throw new Error('Workspace token was not returned')
  }

  if (typeof workspace.workspace !== 'string' || workspace.workspace.length === 0) {
    throw new Error('Workspace id was not returned')
  }

  return {
    endpoint: workspace.endpoint,
    token: workspace.token,
    workspaceId: workspace.workspace
  }
}

async function connectClientOnce(resolvedConfig: AuthConfig): Promise<{ client: HulyClient, config: AuthConfig }> {
  const serverConfig = await loadServerConfig(resolvedConfig.url)
  const workspaceToken = await resolveWorkspaceToken(resolvedConfig, serverConfig.ACCOUNTS_URL)
  const markupOps = createMarkupOperations(
    resolvedConfig.url,
    workspaceToken.workspaceId as never,
    workspaceToken.token,
    serverConfig
  )
  const collaborator = getCollaboratorClient(
    workspaceToken.workspaceId as never,
    workspaceToken.token,
    serverConfig.COLLABORATOR_URL
  )
  const restClient = createRestClient(
    workspaceToken.endpoint,
    workspaceToken.workspaceId,
    workspaceToken.token
  )
  let txOpsPromise: Promise<TxOperations> | undefined

  const getTxOps = async (): Promise<TxOperations> => {
    txOpsPromise ??= withSuppressedBootstrapNoise(async () => await createRestTxOperations(
      workspaceToken.endpoint,
      workspaceToken.workspaceId,
      workspaceToken.token
    ))

    return await txOpsPromise
  }

  const toMarkupString = (value: MarkupContent): string => {
    switch (value.kind) {
      case 'markup':
        return value.content
      case 'html':
        return jsonToMarkup(htmlToJSON(value.content))
      case 'markdown':
        return jsonToMarkup(markdownToMarkup(value.content))
      default:
        throw new Error(`Unsupported markup format: ${String(value.kind)}`)
    }
  }

  const processCreateMarkup = async <T extends Record<string, unknown>>(
    objectClass: Ref<Class<Doc>>,
    objectId: Ref<Doc>,
    data: T
  ): Promise<T> => {
    const result: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(data)) {
      if (value instanceof MarkupContent) {
        result[key] = await markupOps.uploadMarkup(objectClass, objectId, key, value.content, value.kind)
      } else {
        result[key] = value
      }
    }

    return result as T
  }

  const processUpdateMarkup = async <T extends Record<string, unknown>>(
    objectClass: Ref<Class<Doc>>,
    objectId: Ref<Doc>,
    data: T
  ): Promise<T> => {
    const entries = Object.entries(data)
    const hasMarkup = entries.some(([, value]) => value instanceof MarkupContent)

    if (!hasMarkup) {
      return data
    }

    const existingDoc = await restClient.findOne(objectClass, { _id: objectId as never }) as Record<string, unknown> | undefined
    const result: Record<string, unknown> = {}

    for (const [key, value] of entries) {
      if (value instanceof MarkupContent) {
        await collaborator.updateMarkup(makeCollabId(objectClass, objectId, key), toMarkupString(value))
        const currentRef = typeof existingDoc?.[key] === 'string' && existingDoc[key] !== ''
          ? existingDoc[key] as string
          : null

        result[key] = currentRef ?? await markupOps.uploadMarkup(objectClass, objectId, key, value.content, value.kind)
      } else {
        result[key] = value
      }
    }

    return result as T
  }

  const client: HulyClient = {
    getHierarchy: () => {
      throw new Error('getHierarchy is only available through transactional operations')
    },
    getModel: () => {
      throw new Error('getModel is only available through transactional operations')
    },
    getAccount: async () => await restClient.getAccount(),
    findAll: async (...args) => await restClient.findAll(...args),
    findOne: async (...args) => await restClient.findOne(...args),
    createDoc: async (_class, space, attributes, id) => {
      const docId = id ?? generateId()
      const processedAttributes = await processCreateMarkup(_class as Ref<Class<Doc>>, docId as Ref<Doc>, attributes as Record<string, unknown>)
      return await (await getTxOps()).createDoc(_class, space, processedAttributes as Data<any>, docId)
    },
    updateDoc: async (_class, space, objectId, operations, retrieve) => {
      const processedOperations = await processUpdateMarkup(
        _class as Ref<Class<Doc>>,
        objectId as Ref<Doc>,
        operations as Record<string, unknown>
      )
      return await (await getTxOps()).updateDoc(_class, space, objectId, processedOperations as DocumentUpdate<any>, retrieve)
    },
    removeDoc: async (...args) => await (await getTxOps()).removeDoc(...args),
    addCollection: async (_class, space, attachedTo, attachedToClass, collection, attributes, id) => {
      const docId = id ?? generateId()
      const processedAttributes = await processCreateMarkup(_class as Ref<Class<Doc>>, docId as Ref<Doc>, attributes as Record<string, unknown>)
      return await (await getTxOps()).addCollection(
        _class,
        space,
        attachedTo,
        attachedToClass,
        collection,
        processedAttributes as AttachedData<any>,
        docId
      )
    },
    updateCollection: async (_class, space, objectId, attachedTo, attachedToClass, collection, operations, retrieve) => {
      const processedOperations = await processUpdateMarkup(
        _class as Ref<Class<Doc>>,
        objectId as Ref<Doc>,
        operations as Record<string, unknown>
      )
      return await (await getTxOps()).updateCollection(
        _class,
        space,
        objectId,
        attachedTo,
        attachedToClass,
        collection,
        processedOperations as DocumentUpdate<any>,
        retrieve
      )
    },
    removeCollection: async (...args) => await (await getTxOps()).removeCollection(...args),
    createMixin: async (objectId, objectClass, objectSpace, mixin, attributes) => {
      const processedAttributes = await processCreateMarkup(
        objectClass as Ref<Class<Doc>>,
        objectId as Ref<Doc>,
        attributes as Record<string, unknown>
      )
      return await (await getTxOps()).createMixin(
        objectId,
        objectClass,
        objectSpace,
        mixin,
        processedAttributes as MixinData<any, any>
      )
    },
    updateMixin: async (objectId, objectClass, objectSpace, mixin, attributes) => {
      const processedAttributes = await processUpdateMarkup(
        objectClass as Ref<Class<Doc>>,
        objectId as Ref<Doc>,
        attributes as Record<string, unknown>
      )
      return await (await getTxOps()).updateMixin(
        objectId,
        objectClass,
        objectSpace,
        mixin,
        processedAttributes as MixinUpdate<any, any>
      )
    },
    fetchMarkup: async (...args) => await markupOps.fetchMarkup(...args),
    uploadMarkup: async (...args) => await markupOps.uploadMarkup(...args),
    close: async () => {
      if (!txOpsPromise) {
        return
      }

      const txOps = await txOpsPromise as unknown as { close?: () => Promise<void> | void }
      await txOps.close?.()
    }
  }

  return { client, config: resolvedConfig }
}

export async function connectClient(config?: AuthConfig): Promise<{ client: HulyClient, config: AuthConfig }> {
  const resolvedConfig = config ?? (await resolveAuthConfig())

  try {
    return await retry(
      async () => await connectClientOnce(resolvedConfig),
      {
        retries: CONNECT_RETRIES,
        delayMs: CONNECT_RETRY_DELAY_MS,
        shouldRetry: isRetryableConnectionError
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown connection error'
    const code = isAuthErrorMessage(message) ? 'AUTH_INVALID' : 'CONNECTION_ERROR'

    throw new CliError(code, `Failed to connect to Huly: ${message}`, code === 'AUTH_INVALID' ? 2 : 5, error)
  }
}

export async function withClient<T>(fn: (client: HulyClient, config: AuthConfig) => Promise<T>): Promise<T> {
  const { client, config } = await connectClient()

  try {
    return await fn(client, config)
  } finally {
    await client.close()
  }
}
