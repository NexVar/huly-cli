import {
  createRestClient,
  createRestTxOperations,
  getWorkspaceToken,
  loadServerConfig,
  MarkupContent
} from '@hcengineering/api-client'
import { generateId, type Account, type Class, type Doc, type FindOptions, type FindResult, type ModelDb, type Ref, type WithLookup, type TxResult, type Space, type Data, type DocumentUpdate, type AttachedDoc, type AttachedData, type Hierarchy, type TxOperations } from '@hcengineering/core'
import { resolveAuthConfig } from './config'
import { createMarkupOperations } from './markup'
import { CliError } from './output'
import { retry } from './retry'
import type { AuthConfig } from './types'

const CONNECT_RETRIES = 2
const CONNECT_RETRY_DELAY_MS = 250

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
  fetchMarkup: (...args: Parameters<ReturnType<typeof createMarkupOperations>['fetchMarkup']>) => Promise<string>
  uploadMarkup: (...args: Parameters<ReturnType<typeof createMarkupOperations>['uploadMarkup']>) => Promise<any>
  close: () => Promise<void>
}

function toAuthOptions(config: AuthConfig): { workspace: string, token: string } | { workspace: string, email: string, password: string } {
  return config.token !== undefined
    ? { workspace: config.workspace, token: config.token }
    : { workspace: config.workspace, email: config.email, password: config.password }
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

async function connectClientOnce(resolvedConfig: AuthConfig): Promise<{ client: HulyClient, config: AuthConfig }> {
  const serverConfig = await loadServerConfig(resolvedConfig.url)
  const workspaceToken = await getWorkspaceToken(resolvedConfig.url, toAuthOptions(resolvedConfig), serverConfig)
  const markupOps = createMarkupOperations(
    resolvedConfig.url,
    workspaceToken.workspaceId,
    workspaceToken.token,
    serverConfig
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

  const processMarkup = async <T extends Record<string, unknown>>(
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
      const processedAttributes = await processMarkup(_class as Ref<Class<Doc>>, docId as Ref<Doc>, attributes as Record<string, unknown>)
      return await (await getTxOps()).createDoc(_class, space, processedAttributes as Data<any>, docId)
    },
    updateDoc: async (_class, space, objectId, operations, retrieve) => {
      const processedOperations = await processMarkup(
        _class as Ref<Class<Doc>>,
        objectId as Ref<Doc>,
        operations as Record<string, unknown>
      )
      return await (await getTxOps()).updateDoc(_class, space, objectId, processedOperations as DocumentUpdate<any>, retrieve)
    },
    removeDoc: async (...args) => await (await getTxOps()).removeDoc(...args),
    addCollection: async (_class, space, attachedTo, attachedToClass, collection, attributes, id) => {
      const docId = id ?? generateId()
      const processedAttributes = await processMarkup(_class as Ref<Class<Doc>>, docId as Ref<Doc>, attributes as Record<string, unknown>)
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
    fetchMarkup: async (...args) => await markupOps.fetchMarkup(...args),
    uploadMarkup: async (...args) => await markupOps.uploadMarkup(...args),
    close: async () => {}
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
