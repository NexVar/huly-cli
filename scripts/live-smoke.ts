import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import card from '@hcengineering/card'
import core from '@hcengineering/core'

const execFileAsync = promisify(execFile)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const cliRelativePath = path.join('dist', 'bin', 'huly.js')
const cliPath = path.join(repoRoot, cliRelativePath)

const DRIVE_FOLDER_CLASS = 'drive:class:Folder'
const runTimestamp = Date.now()
const prefix = `cli-smoke-auto-${runTimestamp}`

type SuccessPayload<T> = {
  ok: true
  data: T
  total?: number
}

type ErrorPayload = {
  ok: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}

type CliPayload<T> = SuccessPayload<T> | ErrorPayload

type ProjectSummary = {
  id: string
  identifier: string
  name: string | null
}

type IssueSummary = {
  id: string
  identifier: string
  title: string
  project: string | null
  relationIdentifiers: string[]
  blockerIdentifiers: string[]
}

type CommentSummary = {
  id: string
  message: string
}

type TimeTodoSummary = {
  id: string
  title: string
  description: string | null
  isDone: boolean
  dueDate: string | null
  issue: string | null
}

type TimeReportSummary = {
  id: string
  issue: string | null
  value: number
  description: string
  date: string | null
}

type TimeReportTotalsSummary = {
  reportCount: number
  totalValue: number
}

type DriveResourceSummary = {
  id: string
  class: 'folder' | 'file'
  title: string | null
  name: string | null
}

type CardTypeSummary = {
  id: string
  label: string
}

type RawMutationResponse = {
  id: string
  class: string
  result: {
    operation: 'create' | 'update' | 'delete' | 'add-collection'
    space?: string
    attachedTo?: string
    attachedToClass?: string
    collection?: string
  }
}

class CliCommandError extends Error {
  constructor(
    readonly args: string[],
    readonly exitCode: number,
    readonly payload: ErrorPayload
  ) {
    super(`CLI command failed (${exitCode}): ${formatCommand(args)} -> [${payload.error.code}] ${payload.error.message}`)
  }
}

async function main(): Promise<void> {
  await requireBuiltCli()

  log(`Using built CLI at ${cliRelativePath}`)
  log(`Run prefix: ${prefix}`)

  const authStatus = await runCliJson<Record<string, unknown>>(['auth', 'status'])
  assert.equal(authStatus.configured, true, 'auth status must report configured=true')
  expectRecord(authStatus.account, 'auth status account')
  log('Auth status OK')

  const projectsPayload = await runCli<ProjectSummary[]>(['project', 'list'])
  assert.equal(projectsPayload.total, projectsPayload.data.length, 'project list total must match array length')
  assert.ok(projectsPayload.data.length > 0, 'project list must return at least one project')
  const project = projectsPayload.data.find((entry) => entry.identifier === 'HULY') ?? projectsPayload.data[0]
  assert.ok(project, 'expected a project to use for smoke data')
  assert.ok(project.identifier.length > 0, 'selected project must have an identifier')
  log(`Using project ${project.identifier}`)

  let issueOneIdentifier: string | undefined
  let issueTwoIdentifier: string | undefined
  let mainError: unknown
  const cleanupErrors: unknown[] = []

  try {
    issueOneIdentifier = (await runCliJson<IssueSummary>([
      'issue',
      'create',
      '--project',
      project.identifier,
      '--title',
      `${prefix}-issue-1`
    ])).identifier

    issueTwoIdentifier = (await runCliJson<IssueSummary>([
      'issue',
      'create',
      '--project',
      project.identifier,
      '--title',
      `${prefix}-issue-2`
    ])).identifier

    log(`Created issues ${issueOneIdentifier} and ${issueTwoIdentifier}`)

    await exerciseIssueRelations(issueOneIdentifier, issueTwoIdentifier)
    await exerciseComments(issueOneIdentifier)
    await exerciseTimeTodos(issueOneIdentifier)
    await exerciseTimeReports(issueOneIdentifier)
    await exerciseRawDriveFolder()
    await exerciseRawRoleCollection()
  } catch (error) {
    mainError = error
  } finally {
    if (issueTwoIdentifier) {
      try {
        await deleteIssue(issueTwoIdentifier)
      } catch (error) {
        cleanupErrors.push(error)
      }
    }

    if (issueOneIdentifier) {
      try {
        await deleteIssue(issueOneIdentifier)
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
  }

  if (mainError && cleanupErrors.length > 0) {
    throw new AggregateError([mainError, ...cleanupErrors], 'Smoke run failed and cleanup also failed.')
  }

  if (mainError) {
    throw mainError
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Smoke cleanup failed.')
  }

  log('Live smoke completed successfully')
}

async function requireBuiltCli(): Promise<void> {
  try {
    await access(cliPath)
  } catch {
    throw new Error(`Built CLI not found at ${cliRelativePath}. Run "npm run build" first.`)
  }
}

async function exerciseIssueRelations(issueIdentifier: string, relatedIdentifier: string): Promise<void> {
  log('Exercising issue relation and blocker mutations')

  const related = await runCliJson<IssueSummary>([
    'issue',
    'relation',
    'add',
    issueIdentifier,
    '--related',
    relatedIdentifier
  ])
  assert.ok(related.relationIdentifiers.includes(relatedIdentifier), 'related issue must be present after relation add')

  const relatedLoaded = await runCliJson<IssueSummary>(['issue', 'get', issueIdentifier])
  assert.ok(relatedLoaded.relationIdentifiers.includes(relatedIdentifier), 'issue get must reflect relation add')

  const relationRemoved = await runCliJson<IssueSummary>([
    'issue',
    'relation',
    'remove',
    issueIdentifier,
    '--related',
    relatedIdentifier
  ])
  assert.ok(!relationRemoved.relationIdentifiers.includes(relatedIdentifier), 'related issue must be removed')

  const blockerAdded = await runCliJson<IssueSummary>([
    'issue',
    'blocker',
    'add',
    issueIdentifier,
    '--blocked-by',
    relatedIdentifier
  ])
  assert.ok(blockerAdded.blockerIdentifiers.includes(relatedIdentifier), 'blocker must be present after blocker add')

  const blockerLoaded = await runCliJson<IssueSummary>(['issue', 'get', issueIdentifier])
  assert.ok(blockerLoaded.blockerIdentifiers.includes(relatedIdentifier), 'issue get must reflect blocker add')

  const blockerRemoved = await runCliJson<IssueSummary>([
    'issue',
    'blocker',
    'remove',
    issueIdentifier,
    '--blocked-by',
    relatedIdentifier
  ])
  assert.ok(!blockerRemoved.blockerIdentifiers.includes(relatedIdentifier), 'blocker must be removed')
}

async function exerciseComments(issueIdentifier: string): Promise<void> {
  log('Exercising issue comments')

  const before = await runCli<CommentSummary[]>(['comment', 'list', '--on', issueIdentifier])
  const beforeIds = new Set(before.data.map((entry) => entry.id))
  const message = `${prefix}-comment`
  const comment = await runCliJson<CommentSummary>([
    'comment',
    'add',
    '--on',
    issueIdentifier,
    '--message',
    message
  ])

  assert.equal(comment.message, message, 'comment add must echo message content')

  const after = await runCli<CommentSummary[]>(['comment', 'list', '--on', issueIdentifier])
  assert.ok(after.data.some((entry) => entry.id === comment.id), 'comment list must include created comment id')
  assert.ok(after.data.some((entry) => !beforeIds.has(entry.id) && entry.message === message), 'comment list must include created comment message')
}

async function exerciseTimeTodos(issueIdentifier: string): Promise<void> {
  log('Exercising time todo lifecycle')

  let todoId: string | undefined
  let localError: unknown
  const cleanupErrors: unknown[] = []

  try {
    const dueDate = new Date(runTimestamp + 24 * 60 * 60 * 1000).toISOString()
    const updatedDueDate = new Date(runTimestamp + 48 * 60 * 60 * 1000).toISOString()

    const created = await runCliJson<TimeTodoSummary>([
      'time',
      'create',
      '--issue',
      issueIdentifier,
      '--title',
      `${prefix}-todo`,
      '--description',
      `${prefix}-todo-description`,
      '--due-date',
      dueDate
    ])
    todoId = created.id
    assert.equal(created.issue, issueIdentifier, 'todo must be attached to the disposable issue')
    assert.equal(created.title, `${prefix}-todo`, 'todo title must match')
    assert.equal(created.description, `${prefix}-todo-description`, 'todo description must match')
    assert.equal(created.dueDate, dueDate, 'todo due date must match create input')

    const listedAfterCreate = await runCli<TimeTodoSummary[]>(['time', 'list', '--issue', issueIdentifier])
    assert.ok(listedAfterCreate.data.some((entry) => entry.id === todoId), 'time list must include created todo')

    const updated = await runCliJson<TimeTodoSummary>([
      'time',
      'update',
      todoId,
      '--title',
      `${prefix}-todo-updated`,
      '--description',
      `${prefix}-todo-description-updated`,
      '--due-date',
      updatedDueDate
    ])
    assert.equal(updated.title, `${prefix}-todo-updated`, 'todo update must change title')
    assert.equal(updated.description, `${prefix}-todo-description-updated`, 'todo update must change description')
    assert.equal(updated.dueDate, updatedDueDate, 'todo update must change due date')

    const completed = await runCliJson<TimeTodoSummary>(['time', 'done', todoId])
    assert.equal(completed.isDone, true, 'time done must mark todo completed')

    const reopened = await runCliJson<TimeTodoSummary>(['time', 'open', todoId])
    assert.equal(reopened.isDone, false, 'time open must reopen todo')

    const deleted = await runCliJson<{ deleted: boolean, id: string }>(['time', 'delete', todoId])
    assert.equal(deleted.deleted, true, 'time delete must confirm deletion')
    assert.equal(deleted.id, todoId, 'time delete must return the deleted id')
    todoId = undefined
  } catch (error) {
    localError = error
  } finally {
    if (todoId) {
      try {
        const deleted = await runCliJson<{ deleted: boolean, id: string }>(['time', 'delete', todoId])
        assert.equal(deleted.deleted, true, 'todo cleanup delete must confirm deletion')
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
  }

  if (localError && cleanupErrors.length > 0) {
    throw new AggregateError([localError, ...cleanupErrors], 'Time todo smoke failed and cleanup also failed.')
  }

  if (localError) {
    throw localError
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Time todo cleanup failed.')
  }
}

async function exerciseTimeReports(issueIdentifier: string): Promise<void> {
  log('Exercising time report lifecycle')

  let reportId: string | undefined
  let localError: unknown
  const cleanupErrors: unknown[] = []

  try {
    const createDate = new Date(runTimestamp + 3 * 60 * 60 * 1000).toISOString()
    const updateDate = new Date(runTimestamp + 6 * 60 * 60 * 1000).toISOString()

    const listedBeforeCreate = await runCli<TimeReportSummary[]>(['time', 'report', 'list', '--issue', issueIdentifier])
    const countBeforeCreate = listedBeforeCreate.data.length

    const created = await runCliJson<TimeReportSummary>([
      'time',
      'report',
      'create',
      '--issue',
      issueIdentifier,
      '--value',
      '1.5',
      '--description',
      `${prefix}-report`,
      '--date',
      createDate
    ])
    reportId = created.id
    assert.equal(created.issue, issueIdentifier, 'time report must be attached to the disposable issue')
    assert.equal(created.value, 1.5, 'time report create must preserve value')
    assert.equal(created.description, `${prefix}-report`, 'time report create must preserve description')
    assert.equal(created.date, createDate, 'time report create must preserve date')

    const updated = await runCliJson<TimeReportSummary>([
      'time',
      'report',
      'update',
      reportId,
      '--value',
      '2.25',
      '--description',
      `${prefix}-report-updated`,
      '--date',
      updateDate
    ])
    assert.equal(updated.value, 2.25, 'time report update must change value')
    assert.equal(updated.description, `${prefix}-report-updated`, 'time report update must change description')
    assert.equal(updated.date, updateDate, 'time report update must change date')

    const listedAfterUpdate = await runCli<TimeReportSummary[]>(['time', 'report', 'list', '--issue', issueIdentifier])
    assert.equal(listedAfterUpdate.data.length, countBeforeCreate + 1, 'time report list must grow by one after create')
    assert.ok(listedAfterUpdate.data.some((entry) => entry.id === reportId), 'time report list must include created report')

    const totals = await runCliJson<TimeReportTotalsSummary>(['time', 'report', 'totals', '--issue', issueIdentifier])
    assert.equal(totals.reportCount, countBeforeCreate + 1, 'time report totals must reflect one additional report')
    assert.ok(Math.abs(totals.totalValue - 2.25) < Number.EPSILON, 'time report totals must reflect updated value')

    const deleted = await runCliJson<{ deleted: boolean, id: string }>(['time', 'report', 'delete', reportId])
    assert.equal(deleted.deleted, true, 'time report delete must confirm deletion')
    assert.equal(deleted.id, reportId, 'time report delete must return the deleted id')
    reportId = undefined
  } catch (error) {
    localError = error
  } finally {
    if (reportId) {
      try {
        const deleted = await runCliJson<{ deleted: boolean, id: string }>(['time', 'report', 'delete', reportId])
        assert.equal(deleted.deleted, true, 'time report cleanup delete must confirm deletion')
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
  }

  if (localError && cleanupErrors.length > 0) {
    throw new AggregateError([localError, ...cleanupErrors], 'Time report smoke failed and cleanup also failed.')
  }

  if (localError) {
    throw localError
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Time report cleanup failed.')
  }
}

async function exerciseRawDriveFolder(): Promise<void> {
  log('Exercising raw drive folder CRUD')

  let folderId: string | undefined
  let localError: unknown
  const cleanupErrors: unknown[] = []

  try {
    const title = `${prefix}-folder`
    const updatedTitle = `${prefix}-folder-updated`
    const query = JSON.stringify({ title })

    const beforeList = await runCli<Record<string, unknown>[]>([
      'raw',
      'list',
      '--class',
      DRIVE_FOLDER_CLASS,
      '--query',
      query
    ])
    assert.equal(beforeList.data.length, 0, 'raw list must start empty for the unique folder title')

    const created = await runCliJson<RawMutationResponse>([
      'raw',
      'create',
      '--class',
      DRIVE_FOLDER_CLASS,
      '--space',
      core.space.Workspace,
      '--data',
      JSON.stringify({
        title,
        name: title
      })
    ])
    folderId = created.id
    assert.equal(created.class, DRIVE_FOLDER_CLASS, 'raw create must return the drive folder class')
    assert.equal(created.result.operation, 'create', 'raw create must report create operation')
    assert.equal(created.result.space, core.space.Workspace, 'raw create must report workspace space')

    const afterCreateList = await runCli<Record<string, unknown>[]>([
      'raw',
      'list',
      '--class',
      DRIVE_FOLDER_CLASS,
      '--query',
      query
    ])
    assert.ok(afterCreateList.data.some((entry) => readString(entry, '_id') === folderId), 'raw list must include the created folder')

    const createdFolder = await runCliJson<Record<string, unknown>>([
      'raw',
      'get',
      '--class',
      DRIVE_FOLDER_CLASS,
      '--id',
      folderId
    ])
    assert.equal(readString(createdFolder, 'title'), title, 'raw get must return the created folder title')
    assert.equal(readString(createdFolder, 'name'), title, 'raw get must return the created folder name')

    const updated = await runCliJson<RawMutationResponse>([
      'raw',
      'update',
      '--class',
      DRIVE_FOLDER_CLASS,
      '--space',
      core.space.Workspace,
      '--id',
      folderId,
      '--operations',
      JSON.stringify({
        title: updatedTitle,
        name: updatedTitle
      })
    ])
    assert.equal(updated.id, folderId, 'raw update must return the same folder id')
    assert.equal(updated.result.operation, 'update', 'raw update must report update operation')

    const updatedFolder = await runCliJson<Record<string, unknown>>([
      'raw',
      'get',
      '--class',
      DRIVE_FOLDER_CLASS,
      '--id',
      folderId
    ])
    assert.equal(readString(updatedFolder, 'title'), updatedTitle, 'raw get must reflect updated folder title')
    assert.equal(readString(updatedFolder, 'name'), updatedTitle, 'raw get must reflect updated folder name')

    const deleted = await runCliJson<RawMutationResponse>([
      'raw',
      'delete',
      '--class',
      DRIVE_FOLDER_CLASS,
      '--space',
      core.space.Workspace,
      '--id',
      folderId
    ])
    assert.equal(deleted.id, folderId, 'raw delete must return the deleted folder id')
    assert.equal(deleted.result.operation, 'delete', 'raw delete must report delete operation')
    folderId = undefined
  } catch (error) {
    localError = error
  } finally {
    if (folderId) {
      try {
        const deleted = await runCliJson<RawMutationResponse>([
          'raw',
          'delete',
          '--class',
          DRIVE_FOLDER_CLASS,
          '--space',
          core.space.Workspace,
          '--id',
          folderId
        ])
        assert.equal(deleted.result.operation, 'delete', 'raw folder cleanup must report delete operation')
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
  }

  if (localError && cleanupErrors.length > 0) {
    throw new AggregateError([localError, ...cleanupErrors], 'Raw drive folder smoke failed and cleanup also failed.')
  }

  if (localError) {
    throw localError
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Raw drive folder cleanup failed.')
  }
}

async function exerciseRawRoleCollection(): Promise<void> {
  log('Exercising raw role add-collection lifecycle')

  let typeId: string | undefined
  let roleId: string | undefined
  let localError: unknown
  const cleanupErrors: unknown[] = []

  try {
    const type = await runCliJson<CardTypeSummary>([
      'card',
      'type',
      'create',
      '--label',
      `${prefix}-type`
    ])
    typeId = type.id
    assert.equal(type.label, `${prefix}-type`, 'card type create must preserve label')

    const roleName = `${prefix}-role`
    const addedRole = await runCliJson<RawMutationResponse>([
      'raw',
      'add-collection',
      '--class',
      card.class.Role,
      '--space',
      core.space.Model,
      '--attached-to',
      typeId,
      '--attached-to-class',
      card.class.MasterTag,
      '--collection',
      'roles',
      '--data',
      JSON.stringify({
        name: roleName
      })
    ])
    roleId = addedRole.id
    assert.equal(addedRole.class, card.class.Role, 'raw add-collection must return the role class')
    assert.equal(addedRole.result.operation, 'add-collection', 'raw add-collection must report add-collection operation')
    assert.equal(addedRole.result.attachedTo, typeId, 'raw add-collection must target the created type')
    assert.equal(addedRole.result.attachedToClass, card.class.MasterTag, 'raw add-collection must use card master tag as parent class')
    assert.equal(addedRole.result.collection, 'roles', 'raw add-collection must report the roles collection')

    const rawRole = await runCliJson<Record<string, unknown>>([
      'raw',
      'get',
      '--class',
      card.class.Role,
      '--id',
      roleId
    ])
    assert.equal(readString(rawRole, '_id'), roleId, 'raw get must load the created role')
    assert.equal(readString(rawRole, 'name'), roleName, 'raw get must preserve the role name')
    assert.equal(readString(rawRole, 'attachedTo'), typeId, 'raw get must preserve the parent type id')

    const roleList = await runCli<Record<string, unknown>[]>([
      'raw',
      'list',
      '--class',
      card.class.Role,
      '--query',
      JSON.stringify({
        attachedTo: typeId
      })
    ])
    assert.ok(roleList.data.some((entry) => readString(entry, '_id') === roleId), 'raw list must include the added role')

    const deletedRole = await runCliJson<RawMutationResponse>([
      'raw',
      'delete',
      '--class',
      card.class.Role,
      '--space',
      core.space.Model,
      '--id',
      roleId
    ])
    assert.equal(deletedRole.id, roleId, 'raw role delete must return the deleted role id')
    assert.equal(deletedRole.result.operation, 'delete', 'raw role delete must report delete operation')
    roleId = undefined

    const deletedType = await runCliJson<{ deleted: boolean, id: string }>(['card', 'type', 'delete', typeId])
    assert.equal(deletedType.deleted, true, 'card type delete must confirm deletion')
    assert.equal(deletedType.id, typeId, 'card type delete must return the deleted type id')
    typeId = undefined
  } catch (error) {
    localError = error
  } finally {
    if (roleId) {
      try {
        const deletedRole = await runCliJson<RawMutationResponse>([
          'raw',
          'delete',
          '--class',
          card.class.Role,
          '--space',
          core.space.Model,
          '--id',
          roleId
        ])
        assert.equal(deletedRole.result.operation, 'delete', 'raw role cleanup must report delete operation')
      } catch (error) {
        cleanupErrors.push(error)
      }
    }

    if (typeId) {
      try {
        const deletedType = await runCliJson<{ deleted: boolean, id: string }>(['card', 'type', 'delete', typeId])
        assert.equal(deletedType.deleted, true, 'card type cleanup must confirm deletion')
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
  }

  if (localError && cleanupErrors.length > 0) {
    throw new AggregateError([localError, ...cleanupErrors], 'Raw role smoke failed and cleanup also failed.')
  }

  if (localError) {
    throw localError
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Raw role cleanup failed.')
  }
}

async function deleteIssue(identifier: string): Promise<void> {
  const deleted = await runCliJson<{ deleted: boolean, identifier: string }>(['issue', 'delete', identifier])
  assert.equal(deleted.deleted, true, 'issue cleanup delete must confirm deletion')
  assert.equal(deleted.identifier, identifier, 'issue cleanup delete must return the deleted identifier')
}

async function runCliJson<T>(args: string[]): Promise<T> {
  return (await runCli<T>(args)).data
}

async function runCli<T>(args: string[]): Promise<SuccessPayload<T>> {
  const command = formatCommand(args)
  let stdout = ''
  let stderr = ''
  let exitCode = 0

  try {
    const result = await execFileAsync(process.execPath, [cliPath, ...args], {
      cwd: repoRoot,
      env: process.env,
      maxBuffer: 10 * 1024 * 1024
    })
    stdout = result.stdout
    stderr = result.stderr
  } catch (error) {
    const commandError = error as {
      code?: number
      stdout?: string
      stderr?: string
      message?: string
    }

    exitCode = typeof commandError.code === 'number' ? commandError.code : 1
    stdout = commandError.stdout ?? ''
    stderr = commandError.stderr ?? ''

    if (stdout.trim().length > 0) {
      throw new Error(`CLI command ${command} failed with unexpected stdout:\n${stdout}`)
    }

    const payload = parsePayload<never>(stderr, `${command} stderr`)
    if (payload.ok) {
      throw new Error(`CLI command ${command} failed with non-zero exit code ${exitCode} but returned an ok payload.`)
    }

    throw new CliCommandError(args, exitCode, payload)
  }

  if (stderr.trim().length > 0) {
    throw new Error(`CLI command ${command} wrote unexpected stderr:\n${stderr}`)
  }

  const payload = parsePayload<T>(stdout, `${command} stdout`)
  if (!payload.ok) {
    throw new CliCommandError(args, exitCode, payload)
  }

  return payload
}

function parsePayload<T>(output: string, label: string): CliPayload<T> {
  const text = output.trim()
  if (text.length === 0) {
    throw new Error(`${label} is empty; expected a JSON payload.`)
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${(error as Error).message}\n${text}`)
  }

  const payload = expectRecord(parsed, label)
  const ok = payload.ok
  assert.equal(typeof ok, 'boolean', `${label} must include a boolean ok field`)

  if (ok) {
    return {
      ok: true,
      data: payload.data as T,
      ...(payload.total === undefined ? {} : { total: expectNumber(payload.total, `${label} total`) })
    }
  }

  const errorPayload = expectRecord(payload.error, `${label} error`)
  return {
    ok: false,
    error: {
      code: expectString(errorPayload.code, `${label} error.code`),
      message: expectString(errorPayload.message, `${label} error.message`),
      ...(errorPayload.details === undefined ? {} : { details: errorPayload.details })
    }
  }
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  return value as Record<string, unknown>
}

function expectString(value: unknown, label: string): string {
  assert.equal(typeof value, 'string', `${label} must be a string`)
  return value
}

function expectNumber(value: unknown, label: string): number {
  assert.equal(typeof value, 'number', `${label} must be a number`)
  return value
}

function readString(value: unknown, key: string): string {
  const record = expectRecord(value, `raw document for key ${key}`)
  return expectString(record[key], `raw document field ${key}`)
}

function formatCommand(args: string[]): string {
  return `node ${cliRelativePath} ${args.map((arg) => JSON.stringify(arg)).join(' ')}`
}

function log(message: string): void {
  process.stdout.write(`[smoke] ${message}\n`)
}

void main().catch((error) => {
  if (error instanceof AggregateError) {
    console.error('[smoke] Aggregate failure:')
    for (const entry of error.errors) {
      console.error(entry instanceof Error ? entry.message : String(entry))
    }
  } else {
    console.error(`[smoke] ${error instanceof Error ? error.message : String(error)}`)
  }

  process.exitCode = 1
})
