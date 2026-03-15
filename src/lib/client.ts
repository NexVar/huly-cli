import {
  createRestClient,
  createRestTxOperations,
  getWorkspaceToken,
  loadServerConfig
} from '@hcengineering/api-client'
import type { Account, Class, Doc, FindOptions, FindResult, ModelDb, Ref, WithLookup, TxResult, Space, Data, DocumentUpdate, AttachedDoc, AttachedData, Hierarchy, TxOperations } from '@hcengineering/core'
import { resolveAuthConfig } from './config'
import { createMarkupOperations } from './markup'
import { CliError } from './output'
import type { AuthConfig } from './types'

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

export async function connectClient(config?: AuthConfig): Promise<{ client: HulyClient, config: AuthConfig }> {
  const resolvedConfig = config ?? (await resolveAuthConfig())

  try {
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
      createDoc: async (...args) => await (await getTxOps()).createDoc(...args),
      updateDoc: async (...args) => await (await getTxOps()).updateDoc(...args),
      removeDoc: async (...args) => await (await getTxOps()).removeDoc(...args),
      addCollection: async (...args) => await (await getTxOps()).addCollection(...args),
      fetchMarkup: async (...args) => await markupOps.fetchMarkup(...args),
      uploadMarkup: async (...args) => await markupOps.uploadMarkup(...args),
      close: async () => {}
    }

    return { client, config: resolvedConfig }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown connection error'
    const code = message.toLowerCase().includes('auth') || message.toLowerCase().includes('password')
      ? 'AUTH_INVALID'
      : 'CONNECTION_ERROR'

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
