import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { access, cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import card from '@hcengineering/card'
import core from '@hcengineering/core'
import document from '@hcengineering/document'

const execFileAsync = promisify(execFile)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const distDir = path.join(repoRoot, 'dist')
const cliRelativePath = path.join('dist', 'bin', 'huly.js')
let cliPath = path.join(repoRoot, cliRelativePath)

const DRIVE_FOLDER_CLASS = 'drive:class:Folder'
const DOCUMENT_CLASS = 'document:class:Document'
const CONTACT_PERSON_CLASS = 'contact:class:Person'
const CONTACT_SPACE = 'contact:space:Contacts'
const RECRUIT_CANDIDATE_MIXIN = 'recruit:mixin:Candidate'
const runTimestamp = Date.now()
const prefix = `cli-smoke-auto-${runTimestamp}`
const COMMAND_RETRIES = 3
const COMMAND_RETRY_DELAY_MS = 500

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
  description?: string | null
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

type MemberSummary = {
  id: string
  name: string
  email: string | null
}

type CurrentMemberSummary = {
  account: Record<string, unknown>
  member: {
    id: string
    name: string
  } | null
}

type TeamspaceSummary = {
  id: string
  name: string
  description: string | null
  private: boolean
  archived: boolean
}

type DocumentSummary = {
  id: string
  title: string
  content: string | null
  teamspace: string | null
  parentId: string | null
}

type PersonChannelSummary = {
  type: string
  value: string
}

type PersonSummary = {
  id: string
  name: string
  city: string | null
  channels: PersonChannelSummary[]
}

type MilestoneSummary = {
  id: string
  label: string
  status: string
  project: string | null
  targetDate: string | null
}

type LabelSummary = {
  id: string
  title: string
  color: number
  description: string | null
}

type ComponentSummary = {
  id: string
  label: string
  description: string | null
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
    operation: 'create' | 'update' | 'delete' | 'add-collection' | 'update-collection' | 'remove-collection' | 'create-mixin' | 'update-mixin'
    space?: string
    attachedTo?: string
    attachedToClass?: string
    collection?: string
    objectId?: string
    objectClass?: string
    mixin?: string
  }
}

type RawMarkupSummary = {
  objectId: string
  objectClass: string
  attribute: string
  format: 'markdown' | 'html' | 'markup'
  ref?: string
  content?: string
}

class CliCommandError extends Error {
  constructor(
    readonly cliPath: string,
    readonly args: string[],
    readonly exitCode: number,
    readonly payload: ErrorPayload
  ) {
    super(`CLI command failed (${exitCode}): ${formatCommand(cliPath, args)} -> [${payload.error.code}] ${payload.error.message}`)
  }
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs)
  })
}

function isRetryableCliError(error: unknown): error is CliCommandError {
  if (!(error instanceof CliCommandError)) {
    return false
  }

  if (error.payload.error.code === 'CONNECTION_ERROR') {
    return true
  }

  return error.payload.error.code === 'GENERAL_ERROR' && /fetch failed|timed out|network|econn|socket hang up|502|503|504/i.test(error.payload.error.message)
}

function isRetryableCliBootstrapFailure(stderr: string): boolean {
  return /Cannot find module ['"][^'"]+['"][\s\S]*Require stack:[\s\S]*\/dist\//.test(stderr)
}

type RunContext = {
  cwd?: string
  env?: NodeJS.ProcessEnv
}

async function main(): Promise<void> {
  await requireBuiltCli()
  const smokeRoot = path.join(repoRoot, '.omx', 'smoke-runs')
  await mkdir(smokeRoot, { recursive: true })
  const tempRunRoot = await mkdtemp(path.join(smokeRoot, 'dist-'))
  let mainError: unknown
  const cleanupErrors: unknown[] = []

  try {
    await cp(distDir, path.join(tempRunRoot, 'dist'), { recursive: true })
    await cp(path.join(repoRoot, 'package.json'), path.join(tempRunRoot, 'package.json'))
    cliPath = path.join(tempRunRoot, cliRelativePath)

    log(`Using built CLI at ${cliPath}`)
    log(`Run prefix: ${prefix}`)

    const authStatus = await runCliJson<Record<string, unknown>>(['auth', 'status'])
    assert.equal(authStatus.configured, true, 'auth status must report configured=true')
    const authConnection = expectRecord(authStatus.connection, 'auth status connection')
    const authUrl = expectString(authConnection.url, 'auth status connection.url')
    const authWorkspace = expectString(authConnection.workspace, 'auth status connection.workspace')

    expectRecord(authStatus.account, 'auth status account')
    log('Auth status OK')
    await exerciseIsolatedAuthRoundtrip(authUrl, authWorkspace)
    await exerciseMembers()

    const projectsPayload = await runCli<ProjectSummary[]>(['project', 'list'])
    assert.equal(projectsPayload.total, projectsPayload.data.length, 'project list total must match array length')
    assert.ok(projectsPayload.data.length > 0, 'project list must return at least one project')

    let projectIdentifier: string | undefined
    let issueOneIdentifier: string | undefined
    let issueTwoIdentifier: string | undefined

    try {
      const project = await exerciseProjectLifecycle()
      projectIdentifier = project.identifier

      issueOneIdentifier = (await runCliJson<IssueSummary>([
        'issue',
        'create',
        '--project',
        projectIdentifier,
        '--title',
        `${prefix}-issue-1`
      ])).identifier

      issueTwoIdentifier = (await runCliJson<IssueSummary>([
        'issue',
        'create',
        '--project',
        projectIdentifier,
        '--title',
        `${prefix}-issue-2`
      ])).identifier

      log(`Created project ${projectIdentifier} with issues ${issueOneIdentifier} and ${issueTwoIdentifier}`)

      await exerciseIssueRelations(issueOneIdentifier, issueTwoIdentifier)
      await exerciseComments(issueOneIdentifier)
      await exerciseLabelLifecycle(issueOneIdentifier, projectIdentifier)
      await exerciseMilestones(projectIdentifier)
      await exerciseComponents(projectIdentifier)
      await exerciseTimeTodos(issueOneIdentifier)
      await exerciseTimeReports(issueOneIdentifier)
      await exerciseTeamspaceDocuments()
      await exercisePersons()
      await exerciseRawDriveFolder()
      await exerciseRawCollectionLifecycle()
      await exerciseRawMixinLifecycle()
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

      if (projectIdentifier) {
        try {
          await deleteProject(projectIdentifier)
        } catch (error) {
          cleanupErrors.push(error)
        }
      }
    }
  } catch (error) {
    mainError = error
  } finally {
    cliPath = path.join(repoRoot, cliRelativePath)
    try {
      await rm(tempRunRoot, { recursive: true, force: true })
    } catch (error) {
      cleanupErrors.push(error)
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

async function exerciseIsolatedAuthRoundtrip(url: string, workspace: string): Promise<void> {
  log('Exercising isolated token auth login/status/logout')

  const token = await resolveAuthToken()
  const tempHome = await mkdtemp(path.join(tmpdir(), 'huly-cli-smoke-home-'))
  const tempCwd = await mkdtemp(path.join(tmpdir(), 'huly-cli-smoke-cwd-'))
  const isolatedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: tempHome,
    USERPROFILE: tempHome,
    HULY_URL: '',
    HULY_WORKSPACE: '',
    HULY_EMAIL: '',
    HULY_PASSWORD: '',
    HULY_TOKEN: ''
  }

  try {
    const login = await runCliJson<{ saved: boolean }>([
      'auth',
      'login',
      '--url',
      url,
      '--workspace',
      workspace,
      '--token',
      token
    ], {
      cwd: tempCwd,
      env: isolatedEnv
    })
    assert.equal(login.saved, true, 'isolated auth login must save config')

    const status = await runCliJson<Record<string, unknown>>(['auth', 'status'], {
      cwd: tempCwd,
      env: isolatedEnv
    })
    assert.equal(status.configured, true, 'isolated auth status must report configured=true')
    const configSource = expectRecord(status.configSource, 'isolated auth status configSource')
    assert.equal(configSource.file !== null, true, 'isolated auth status must resolve file config')
    const statusConnection = expectRecord(status.connection, 'isolated auth status connection')
    assert.equal(expectString(statusConnection.authMethod, 'isolated auth status authMethod'), 'token', 'isolated auth status must use token auth')

    const logout = await runCliJson<{ removed: boolean }>(['auth', 'logout'], {
      cwd: tempCwd,
      env: isolatedEnv
    })
    assert.equal(logout.removed, true, 'isolated auth logout must remove temp config')
  } finally {
    await rm(tempHome, { recursive: true, force: true })
    await rm(tempCwd, { recursive: true, force: true })
  }
}

async function resolveAuthToken(): Promise<string> {
  const envToken = process.env.HULY_TOKEN

  if (typeof envToken === 'string' && envToken.trim().length > 0) {
    return envToken.trim()
  }

  const envPath = path.join(repoRoot, '.env')
  const envRaw = await readFile(envPath, 'utf8')
  const lines = envRaw.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue
    }

    const separator = trimmed.indexOf('=')
    if (separator <= 0) {
      continue
    }

    const key = trimmed.slice(0, separator).trim()
    if (key !== 'HULY_TOKEN') {
      continue
    }

    const rawValue = trimmed.slice(separator + 1).trim()
    const unquoted = rawValue.replace(/^['"]|['"]$/g, '').trim()

    if (unquoted.length === 0) {
      break
    }

    return unquoted
  }

  throw new Error('Unable to resolve HULY_TOKEN for isolated auth smoke. Set HULY_TOKEN or add it to .env.')
}

async function exerciseMembers(): Promise<void> {
  log('Exercising member read commands')

  const members = await runCli<MemberSummary[]>(['member', 'list', '--limit', '5'])
  assert.ok(members.data.length > 0, 'member list must return at least one member')
  assert.equal(members.total, members.data.length, 'member list total must match returned member count')
  assert.ok(members.data.some((member) => member.name.trim().length > 0), 'member list entries must include names')

  const me = await runCliJson<CurrentMemberSummary>(['member', 'me'])
  expectRecord(me.account, 'member me account')
  if (me.member !== null) {
    assert.ok(me.member.id.length > 0, 'member me must return a member id when available')
    assert.ok(me.member.name.length > 0, 'member me must return a member name when available')
  }
}

async function exerciseProjectLifecycle(): Promise<ProjectSummary> {
  log('Exercising project lifecycle')

  const baseIdentifier = `SMK${String(runTimestamp).slice(-8)}`
  const updatedIdentifier = `${baseIdentifier}X`
  const created = await runCliJson<ProjectSummary>([
    'project',
    'create',
    '--identifier',
    baseIdentifier,
    '--name',
    `${prefix}-project`,
    '--description',
    `${prefix}-project-description`
  ])

  assert.equal(created.identifier, baseIdentifier, 'project create must preserve the requested identifier')
  assert.equal(created.name, `${prefix}-project`, 'project create must preserve the requested name')
  assert.equal(created.description, `${prefix}-project-description`, 'project create must preserve the requested description')

  const listedAfterCreate = await runCli<ProjectSummary[]>(['project', 'list'])
  assert.ok(listedAfterCreate.data.some((project) => project.identifier === baseIdentifier), 'project list must include the created project')

  const loaded = await runCliJson<ProjectSummary>(['project', 'get', baseIdentifier])
  assert.equal(loaded.id, created.id, 'project get must load the created project')

  const updated = await runCliJson<ProjectSummary>([
    'project',
    'update',
    baseIdentifier,
    '--identifier',
    updatedIdentifier,
    '--name',
    `${prefix}-project-updated`,
    '--description',
    `${prefix}-project-description-updated`
  ])
  assert.equal(updated.identifier, updatedIdentifier, 'project update must change the project identifier')
  assert.equal(updated.name, `${prefix}-project-updated`, 'project update must change the project name')
  assert.equal(updated.description, `${prefix}-project-description-updated`, 'project update must change the project description')

  const cleared = await runCliJson<ProjectSummary>([
    'project',
    'update',
    updatedIdentifier,
    '--clear-description'
  ])
  assert.equal(cleared.identifier, updatedIdentifier, 'project clear-description must keep the project identifier')
  assert.equal(cleared.description, '', 'project clear-description must clear the project description')

  const loadedAfterUpdate = await runCliJson<ProjectSummary>(['project', 'get', updatedIdentifier])
  assert.equal(loadedAfterUpdate.id, created.id, 'project get must still resolve after identifier update')
  assert.equal(loadedAfterUpdate.identifier, updatedIdentifier, 'project get must reflect the updated identifier')

  return loadedAfterUpdate
}

async function exerciseLabelLifecycle(issueIdentifier: string, projectIdentifier: string): Promise<void> {
  log('Exercising label lifecycle')

  let labelId: string | undefined
  let labelTitle = `${prefix}-label`
  let assigned = false
  let localError: unknown
  const cleanupErrors: unknown[] = []

  try {
    const created = await runCliJson<LabelSummary>([
      'label',
      'create',
      '--title',
      labelTitle,
      '--color',
      '11',
      '--description',
      `${prefix}-label-description`
    ])
    labelId = created.id
    assert.equal(created.title, labelTitle, 'label create must preserve the title')
    assert.equal(created.color, 11, 'label create must preserve the color')

    const listed = await runCli<LabelSummary[]>(['label', 'list'])
    assert.ok(listed.data.some((label) => label.id === labelId), 'label list must include the created label')

    const loaded = await runCliJson<LabelSummary>(['label', 'get', labelId])
    assert.equal(loaded.id, labelId, 'label get must load the created label')

    labelTitle = `${prefix}-label-updated`
    const updated = await runCliJson<LabelSummary>([
      'label',
      'update',
      labelId,
      '--title',
      labelTitle,
      '--color',
      '12',
      '--description',
      `${prefix}-label-description-updated`
    ])
    assert.equal(updated.title, labelTitle, 'label update must change the title')
    assert.equal(updated.color, 12, 'label update must change the color')

    const assignResult = await runCliJson<{ assigned: boolean, issue: string, label: string }>([
      'label',
      'assign',
      issueIdentifier,
      '--label',
      labelTitle
    ])
    assert.equal(assignResult.assigned, true, 'label assign must confirm the assignment')
    assigned = true

    const projectLabels = await runCli<LabelSummary[]>(['label', 'list', '--project', projectIdentifier])
    assert.ok(projectLabels.data.some((label) => label.id === labelId), 'project-scoped label list must include the assigned label')

    const unassignResult = await runCliJson<{ unassigned: boolean, issue: string, label: string }>([
      'label',
      'unassign',
      issueIdentifier,
      '--label',
      labelTitle
    ])
    assert.equal(unassignResult.unassigned, true, 'label unassign must confirm the removal')
    assigned = false

    const deleted = await runCliJson<{ deleted: boolean, id: string }>(['label', 'delete', labelId])
    assert.equal(deleted.deleted, true, 'label delete must confirm deletion')
    labelId = undefined
  } catch (error) {
    localError = error
  } finally {
    if (assigned) {
      try {
        const unassignResult = await runCliJson<{ unassigned: boolean }>([
          'label',
          'unassign',
          issueIdentifier,
          '--label',
          labelTitle
        ])
        assert.equal(unassignResult.unassigned, true, 'label cleanup must unassign the label')
      } catch (error) {
        cleanupErrors.push(error)
      }
    }

    if (labelId) {
      try {
        const deleted = await runCliJson<{ deleted: boolean }>(['label', 'delete', labelId])
        assert.equal(deleted.deleted, true, 'label cleanup delete must confirm deletion')
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
  }

  if (localError && cleanupErrors.length > 0) {
    throw new AggregateError([localError, ...cleanupErrors], 'Label smoke failed and cleanup also failed.')
  }

  if (localError) {
    throw localError
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Label cleanup failed.')
  }
}

async function exerciseMilestones(projectIdentifier: string): Promise<void> {
  log('Exercising milestone lifecycle')

  let milestoneId: string | undefined
  let localError: unknown
  const cleanupErrors: unknown[] = []

  try {
    const createDate = new Date(runTimestamp + 72 * 60 * 60 * 1000).toISOString()
    const updateDate = new Date(runTimestamp + 96 * 60 * 60 * 1000).toISOString()

    const created = await runCliJson<MilestoneSummary>([
      'milestone',
      'create',
      '--project',
      projectIdentifier,
      '--label',
      `${prefix}-milestone`,
      '--status',
      'Planned',
      '--target-date',
      createDate
    ])
    milestoneId = created.id
    assert.equal(created.project, projectIdentifier, 'milestone create must target the disposable project')
    assert.equal(created.label, `${prefix}-milestone`, 'milestone create must preserve the label')

    const listed = await runCli<MilestoneSummary[]>([
      'milestone',
      'list',
      '--project',
      projectIdentifier,
      '--label',
      `${prefix}-milestone`
    ])
    assert.ok(listed.data.some((milestone) => milestone.id === milestoneId), 'milestone list must include the created milestone')

    const loaded = await runCliJson<MilestoneSummary>(['milestone', 'get', milestoneId])
    assert.equal(loaded.id, milestoneId, 'milestone get must load the created milestone')

    const updated = await runCliJson<MilestoneSummary>([
      'milestone',
      'update',
      milestoneId,
      '--label',
      `${prefix}-milestone-updated`,
      '--status',
      'InProgress',
      '--target-date',
      updateDate
    ])
    assert.equal(updated.label, `${prefix}-milestone-updated`, 'milestone update must change the label')
    assert.equal(updated.status, 'InProgress', 'milestone update must change the status')

    const filtered = await runCli<MilestoneSummary[]>([
      'milestone',
      'list',
      '--project',
      projectIdentifier,
      '--status',
      'InProgress',
      '--date-from',
      updateDate,
      '--date-to',
      updateDate
    ])
    assert.ok(filtered.data.some((milestone) => milestone.id === milestoneId), 'milestone filters must include the updated milestone')

    const deleted = await runCliJson<{ deleted: boolean, id: string }>(['milestone', 'delete', milestoneId])
    assert.equal(deleted.deleted, true, 'milestone delete must confirm deletion')
    milestoneId = undefined
  } catch (error) {
    localError = error
  } finally {
    if (milestoneId) {
      try {
        const deleted = await runCliJson<{ deleted: boolean }>(['milestone', 'delete', milestoneId])
        assert.equal(deleted.deleted, true, 'milestone cleanup delete must confirm deletion')
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
  }

  if (localError && cleanupErrors.length > 0) {
    throw new AggregateError([localError, ...cleanupErrors], 'Milestone smoke failed and cleanup also failed.')
  }

  if (localError) {
    throw localError
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Milestone cleanup failed.')
  }
}

async function exerciseComponents(projectIdentifier: string): Promise<void> {
  log('Exercising component lifecycle')

  let componentId: string | undefined
  let localError: unknown
  const cleanupErrors: unknown[] = []

  try {
    const created = await runCliJson<ComponentSummary>([
      'component',
      'create',
      '--project',
      projectIdentifier,
      '--label',
      `${prefix}-component`,
      '--description',
      `${prefix}-component-description`
    ])
    componentId = created.id
    assert.equal(created.label, `${prefix}-component`, 'component create must preserve the label')
    assert.equal(created.description, `${prefix}-component-description`, 'component create must preserve the description')

    const listed = await runCli<ComponentSummary[]>(['component', 'list', '--project', projectIdentifier])
    assert.ok(listed.data.some((component) => component.id === componentId), 'component list must include the created component')

    const loaded = await runCliJson<ComponentSummary>(['component', 'get', componentId])
    assert.equal(loaded.id, componentId, 'component get must load the created component')

    const updated = await runCliJson<ComponentSummary>([
      'component',
      'update',
      componentId,
      '--label',
      `${prefix}-component-updated`,
      '--description',
      `${prefix}-component-description-updated`
    ])
    assert.equal(updated.label, `${prefix}-component-updated`, 'component update must change the label')
    assert.equal(updated.description, `${prefix}-component-description-updated`, 'component update must change the description')

    const cleared = await runCliJson<ComponentSummary>([
      'component',
      'update',
      componentId,
      '--clear-description'
    ])
    assert.equal(cleared.description, null, 'component clear-description must clear the description')

    const deleted = await runCliJson<{ deleted: boolean, id: string }>(['component', 'delete', componentId])
    assert.equal(deleted.deleted, true, 'component delete must confirm deletion')
    componentId = undefined
  } catch (error) {
    localError = error
  } finally {
    if (componentId) {
      try {
        const deleted = await runCliJson<{ deleted: boolean }>(['component', 'delete', componentId])
        assert.equal(deleted.deleted, true, 'component cleanup delete must confirm deletion')
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
  }

  if (localError && cleanupErrors.length > 0) {
    throw new AggregateError([localError, ...cleanupErrors], 'Component smoke failed and cleanup also failed.')
  }

  if (localError) {
    throw localError
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Component cleanup failed.')
  }
}

async function exerciseTeamspaceDocuments(): Promise<void> {
  log('Exercising teamspace and document lifecycles')

  let teamspaceId: string | undefined
  let teamspaceName = `${prefix}-teamspace`
  let parentDocId: string | undefined
  let childDocId: string | undefined
  let localError: unknown
  const cleanupErrors: unknown[] = []

  try {
    const createdTeamspace = await runCliJson<TeamspaceSummary>([
      'teamspace',
      'create',
      '--name',
      teamspaceName,
      '--description',
      `${prefix}-teamspace-description`,
      '--private'
    ])
    teamspaceId = createdTeamspace.id
    assert.equal(createdTeamspace.name, teamspaceName, 'teamspace create must preserve the name')
    assert.equal(createdTeamspace.private, true, 'teamspace create must preserve the private flag')

    const listedTeamspaces = await runCli<TeamspaceSummary[]>([
      'teamspace',
      'list',
      '--name',
      teamspaceName,
      '--private'
    ])
    assert.ok(listedTeamspaces.data.some((teamspace) => teamspace.id === teamspaceId), 'teamspace list must include the created teamspace')

    const loadedTeamspace = await runCliJson<TeamspaceSummary>(['teamspace', 'get', teamspaceId])
    assert.equal(loadedTeamspace.id, teamspaceId, 'teamspace get must load the created teamspace')

    teamspaceName = `${prefix}-teamspace-updated`
    const updatedTeamspace = await runCliJson<TeamspaceSummary>([
      'teamspace',
      'update',
      teamspaceId,
      '--name',
      teamspaceName,
      '--description',
      `${prefix}-teamspace-description-updated`,
      '--public'
    ])
    assert.equal(updatedTeamspace.name, teamspaceName, 'teamspace update must change the name')
    assert.equal(updatedTeamspace.private, false, 'teamspace update must switch the teamspace to public')

    const parentDoc = await runCliJson<DocumentSummary>([
      'doc',
      'create',
      '--teamspace',
      teamspaceName,
      '--title',
      `${prefix}-doc-parent`,
      '--content',
      `${prefix}-doc-parent-content`
    ])
    parentDocId = parentDoc.id
    assert.equal(parentDoc.teamspace, teamspaceName, 'document create must target the updated teamspace')
    assert.equal(parentDoc.parentId, null, 'parent document must be created at the root')

    const childDoc = await runCliJson<DocumentSummary>([
      'doc',
      'create',
      '--teamspace',
      teamspaceName,
      '--title',
      `${prefix}-doc-child`,
      '--content',
      `${prefix}-doc-child-content`,
      '--parent',
      parentDocId
    ])
    childDocId = childDoc.id
    assert.equal(childDoc.parentId, parentDocId, 'child document must be attached to the parent document')

    const rawParentDoc = await runCliJson<Record<string, unknown>>([
      'raw',
      'get',
      '--class',
      DOCUMENT_CLASS,
      '--id',
      parentDocId
    ])
    const parentContentRef = readString(rawParentDoc, 'content')

    const fetchedParentMarkup = await runCliJson<RawMarkupSummary>([
      'raw',
      'fetch-markup',
      '--object-id',
      parentDocId,
      '--object-class',
      DOCUMENT_CLASS,
      '--attribute',
      'content',
      '--ref',
      parentContentRef,
      '--format',
      'markdown'
    ])
    assert.equal(fetchedParentMarkup.content, `${prefix}-doc-parent-content`, 'raw fetch-markup must load markdown content from the document')

    const uploadedChildMarkup = await runCliJson<RawMarkupSummary>([
      'raw',
      'upload-markup',
      '--object-id',
      childDocId,
      '--object-class',
      DOCUMENT_CLASS,
      '--attribute',
      'content',
      '--content',
      `${prefix}-doc-child-uploaded`,
      '--format',
      'markdown'
    ])
    assert.equal(uploadedChildMarkup.objectId, childDocId, 'raw upload-markup must target the child document')
    assert.ok(typeof uploadedChildMarkup.ref === 'string' && uploadedChildMarkup.ref.length > 0, 'raw upload-markup must return a markup ref')

    const rootDocs = await runCli<DocumentSummary[]>([
      'doc',
      'list',
      '--teamspace',
      teamspaceName,
      '--root'
    ])
    assert.ok(rootDocs.data.some((doc) => doc.id === parentDocId), 'root document list must include the parent document')
    assert.ok(!rootDocs.data.some((doc) => doc.id === childDocId), 'root document list must not include the nested child document')

    const childDocs = await runCli<DocumentSummary[]>([
      'doc',
      'list',
      '--teamspace',
      teamspaceName,
      '--parent',
      parentDocId
    ])
    assert.ok(childDocs.data.some((doc) => doc.id === childDocId), 'child document list must include the nested child document')

    const loadedChild = await runCliJson<DocumentSummary>(['doc', 'get', childDocId])
    assert.equal(loadedChild.content, `${prefix}-doc-child-content`, 'document get must return the created markdown content')

    const rawLoadedChild = await runCliJson<Record<string, unknown>>([
      'raw',
      'get',
      '--class',
      document.class.Document,
      '--id',
      childDocId,
      '--markup-fields',
      'content'
    ])
    assert.equal(readString(rawLoadedChild, 'content'), `${prefix}-doc-child-content`, 'raw get --markup-fields must resolve document content as markdown')

    const movedChild = await runCliJson<DocumentSummary>([
      'doc',
      'update',
      childDocId,
      '--title',
      `${prefix}-doc-child-updated`,
      '--content',
      `${prefix}-doc-child-content-updated`,
      '--root'
    ])
    assert.equal(movedChild.title, `${prefix}-doc-child-updated`, 'document update must change the child title')
    assert.equal(movedChild.parentId, null, 'document update --root must move the child document to the root')

    const archivedTeamspace = await runCliJson<TeamspaceSummary>(['teamspace', 'update', teamspaceId, '--archive'])
    assert.equal(archivedTeamspace.archived, true, 'teamspace update --archive must archive the teamspace')

    const unarchivedTeamspace = await runCliJson<TeamspaceSummary>([
      'teamspace',
      'update',
      teamspaceId,
      '--unarchive',
      '--clear-description'
    ])
    assert.equal(unarchivedTeamspace.archived, false, 'teamspace update --unarchive must unarchive the teamspace')
    assert.equal(unarchivedTeamspace.description, null, 'teamspace clear-description must clear the description')

    const deletedChild = await runCliJson<{ deleted: boolean, id: string }>(['doc', 'delete', childDocId])
    assert.equal(deletedChild.deleted, true, 'document delete must confirm child deletion')
    childDocId = undefined

    const deletedParent = await runCliJson<{ deleted: boolean, id: string }>(['doc', 'delete', parentDocId])
    assert.equal(deletedParent.deleted, true, 'document delete must confirm parent deletion')
    parentDocId = undefined

    const deletedTeamspace = await runCliJson<{ deleted: boolean, id: string }>(['teamspace', 'delete', teamspaceId])
    assert.equal(deletedTeamspace.deleted, true, 'teamspace delete must confirm deletion')
    teamspaceId = undefined
  } catch (error) {
    localError = error
  } finally {
    if (childDocId) {
      try {
        const deleted = await runCliJson<{ deleted: boolean }>(['doc', 'delete', childDocId])
        assert.equal(deleted.deleted, true, 'child document cleanup must confirm deletion')
      } catch (error) {
        cleanupErrors.push(error)
      }
    }

    if (parentDocId) {
      try {
        const deleted = await runCliJson<{ deleted: boolean }>(['doc', 'delete', parentDocId])
        assert.equal(deleted.deleted, true, 'parent document cleanup must confirm deletion')
      } catch (error) {
        cleanupErrors.push(error)
      }
    }

    if (teamspaceId) {
      try {
        const deleted = await runCliJson<{ deleted: boolean }>(['teamspace', 'delete', teamspaceId])
        assert.equal(deleted.deleted, true, 'teamspace cleanup must confirm deletion')
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
  }

  if (localError && cleanupErrors.length > 0) {
    throw new AggregateError([localError, ...cleanupErrors], 'Teamspace/document smoke failed and cleanup also failed.')
  }

  if (localError) {
    throw localError
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Teamspace/document cleanup failed.')
  }
}

async function exercisePersons(): Promise<void> {
  log('Exercising person lifecycle')

  let personId: string | undefined
  let localError: unknown
  const cleanupErrors: unknown[] = []

  try {
    const createdEmail = `${prefix}-person@example.com`
    const updatedEmail = `${prefix}-person-updated@example.com`

    const created = await runCliJson<PersonSummary>([
      'person',
      'create',
      '--name',
      `${prefix}-person`,
      '--city',
      `${prefix}-city`,
      '--email',
      createdEmail
    ])
    personId = created.id
    assert.equal(created.name, `${prefix}-person`, 'person create must preserve the name')
    assert.equal(created.city, `${prefix}-city`, 'person create must preserve the city')
    assert.ok(created.channels.some((channel) => channel.value === createdEmail.toLowerCase()), 'person create must attach the requested email channel')

    const listed = await runCli<PersonSummary[]>([
      'person',
      'list',
      '--email',
      createdEmail
    ])
    assert.ok(listed.data.some((person) => person.id === personId), 'person list must include the created person')

    const loaded = await runCliJson<PersonSummary>(['person', 'get', personId])
    assert.equal(loaded.id, personId, 'person get must load the created person')

    const updated = await runCliJson<PersonSummary>([
      'person',
      'update',
      personId,
      '--name',
      `${prefix}-person-updated`,
      '--city',
      `${prefix}-city-updated`,
      '--email',
      updatedEmail
    ])
    assert.equal(updated.name, `${prefix}-person-updated`, 'person update must change the name')
    assert.equal(updated.city, `${prefix}-city-updated`, 'person update must change the city')
    assert.ok(updated.channels.some((channel) => channel.value === updatedEmail.toLowerCase()), 'person update must change the email channel')

    const cleared = await runCliJson<PersonSummary>([
      'person',
      'update',
      personId,
      '--clear-city',
      '--clear-email'
    ])
    assert.equal(cleared.city, null, 'person clear-city must clear the city')
    assert.equal(cleared.channels.length, 0, 'person clear-email must remove email channels')

    const deleted = await runCliJson<{ deleted: boolean, id: string }>(['person', 'delete', personId])
    assert.equal(deleted.deleted, true, 'person delete must confirm deletion')
    personId = undefined
  } catch (error) {
    localError = error
  } finally {
    if (personId) {
      try {
        const deleted = await runCliJson<{ deleted: boolean }>(['person', 'delete', personId])
        assert.equal(deleted.deleted, true, 'person cleanup delete must confirm deletion')
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
  }

  if (localError && cleanupErrors.length > 0) {
    throw new AggregateError([localError, ...cleanupErrors], 'Person smoke failed and cleanup also failed.')
  }

  if (localError) {
    throw localError
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Person cleanup failed.')
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

async function exerciseRawCollectionLifecycle(): Promise<void> {
  log('Exercising raw collection add/update/remove lifecycle')

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
    const updatedRoleName = `${prefix}-role-updated`
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

    const updatedRole = await runCliJson<RawMutationResponse>([
      'raw',
      'update-collection',
      '--class',
      card.class.Role,
      '--space',
      core.space.Model,
      '--id',
      roleId,
      '--attached-to',
      typeId,
      '--attached-to-class',
      card.class.MasterTag,
      '--collection',
      'roles',
      '--operations',
      JSON.stringify({
        name: updatedRoleName
      })
    ])
    assert.equal(updatedRole.id, roleId, 'raw update-collection must return the updated role id')
    assert.equal(updatedRole.result.operation, 'update-collection', 'raw update-collection must report update-collection operation')
    assert.equal(updatedRole.result.attachedTo, typeId, 'raw update-collection must preserve the parent type id')

    const rawUpdatedRole = await runCliJson<Record<string, unknown>>([
      'raw',
      'get',
      '--class',
      card.class.Role,
      '--id',
      roleId
    ])
    assert.equal(readString(rawUpdatedRole, 'name'), updatedRoleName, 'raw update-collection must update the role name')

    const removedRole = await runCliJson<RawMutationResponse>([
      'raw',
      'remove-collection',
      '--class',
      card.class.Role,
      '--space',
      core.space.Model,
      '--id',
      roleId
      ,
      '--attached-to',
      typeId,
      '--attached-to-class',
      card.class.MasterTag,
      '--collection',
      'roles'
    ])
    assert.equal(removedRole.id, roleId, 'raw remove-collection must return the removed role id')
    assert.equal(removedRole.result.operation, 'remove-collection', 'raw remove-collection must report remove-collection operation')
    assert.equal(removedRole.result.attachedTo, typeId, 'raw remove-collection must preserve the parent type id')
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
          'remove-collection',
          '--class',
          card.class.Role,
          '--space',
          core.space.Model,
          '--id',
          roleId,
          '--attached-to',
          typeId,
          '--attached-to-class',
          card.class.MasterTag,
          '--collection',
          'roles'
        ])
        assert.equal(deletedRole.result.operation, 'remove-collection', 'raw role cleanup must report remove-collection operation')
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
    throw new AggregateError([localError, ...cleanupErrors], 'Raw collection smoke failed and cleanup also failed.')
  }

  if (localError) {
    throw localError
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Raw collection cleanup failed.')
  }
}

async function exerciseRawMixinLifecycle(): Promise<void> {
  log('Exercising raw mixin create/update lifecycle')

  let personId: string | undefined
  let localError: unknown
  const cleanupErrors: unknown[] = []

  try {
    const createdPerson = await runCliJson<RawMutationResponse>([
      'raw',
      'create',
      '--class',
      CONTACT_PERSON_CLASS,
      '--space',
      CONTACT_SPACE,
      '--data',
      JSON.stringify({
        name: `${prefix}-candidate-person`,
        city: 'tmp'
      })
    ])
    personId = createdPerson.id

    const createdMixin = await runCliJson<RawMutationResponse>([
      'raw',
      'create-mixin',
      '--object-id',
      personId,
      '--object-class',
      CONTACT_PERSON_CLASS,
      '--object-space',
      CONTACT_SPACE,
      '--mixin',
      RECRUIT_CANDIDATE_MIXIN,
      '--data',
      JSON.stringify({
        title: `${prefix}-candidate-title`,
        source: 'smoke',
        remote: true
      })
    ])
    assert.equal(createdMixin.id, personId, 'raw create-mixin must return the base document id')
    assert.equal(createdMixin.result.operation, 'create-mixin', 'raw create-mixin must report create-mixin operation')
    assert.equal(createdMixin.result.mixin, RECRUIT_CANDIDATE_MIXIN, 'raw create-mixin must report the applied mixin')

    const personWithMixin = await runCliJson<Record<string, unknown>>([
      'raw',
      'get',
      '--class',
      CONTACT_PERSON_CLASS,
      '--id',
      personId
    ])
    const createdCandidateMixin = expectRecord(personWithMixin[RECRUIT_CANDIDATE_MIXIN], 'created recruit candidate mixin')
    assert.equal(expectString(createdCandidateMixin.title, 'created recruit candidate mixin title'), `${prefix}-candidate-title`)
    assert.equal(expectString(createdCandidateMixin.source, 'created recruit candidate mixin source'), 'smoke')
    assert.equal(createdCandidateMixin.remote, true, 'created recruit candidate mixin remote must be true')

    const updatedMixin = await runCliJson<RawMutationResponse>([
      'raw',
      'update-mixin',
      '--object-id',
      personId,
      '--object-class',
      CONTACT_PERSON_CLASS,
      '--object-space',
      CONTACT_SPACE,
      '--mixin',
      RECRUIT_CANDIDATE_MIXIN,
      '--operations',
      JSON.stringify({
        title: `${prefix}-candidate-title-updated`,
        onsite: false
      })
    ])
    assert.equal(updatedMixin.id, personId, 'raw update-mixin must return the base document id')
    assert.equal(updatedMixin.result.operation, 'update-mixin', 'raw update-mixin must report update-mixin operation')

    const updatedPersonWithMixin = await runCliJson<Record<string, unknown>>([
      'raw',
      'get',
      '--class',
      CONTACT_PERSON_CLASS,
      '--id',
      personId
    ])
    const updatedCandidateMixin = expectRecord(updatedPersonWithMixin[RECRUIT_CANDIDATE_MIXIN], 'updated recruit candidate mixin')
    assert.equal(expectString(updatedCandidateMixin.title, 'updated recruit candidate mixin title'), `${prefix}-candidate-title-updated`)
    assert.equal(updatedCandidateMixin.onsite, false, 'updated recruit candidate mixin onsite must be false')

    const deletedPerson = await runCliJson<RawMutationResponse>([
      'raw',
      'delete',
      '--class',
      CONTACT_PERSON_CLASS,
      '--space',
      CONTACT_SPACE,
      '--id',
      personId
    ])
    assert.equal(deletedPerson.id, personId, 'raw delete must remove the disposable person')
    personId = undefined
  } catch (error) {
    localError = error
  } finally {
    if (personId) {
      try {
        const deletedPerson = await runCliJson<RawMutationResponse>([
          'raw',
          'delete',
          '--class',
          CONTACT_PERSON_CLASS,
          '--space',
          CONTACT_SPACE,
          '--id',
          personId
        ])
        assert.equal(deletedPerson.result.operation, 'delete', 'raw mixin cleanup must delete the disposable person')
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
  }

  if (localError && cleanupErrors.length > 0) {
    throw new AggregateError([localError, ...cleanupErrors], 'Raw mixin smoke failed and cleanup also failed.')
  }

  if (localError) {
    throw localError
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Raw mixin cleanup failed.')
  }
}

async function deleteIssue(identifier: string): Promise<void> {
  const deleted = await runCliJson<{ deleted: boolean, identifier: string }>(['issue', 'delete', identifier])
  assert.equal(deleted.deleted, true, 'issue cleanup delete must confirm deletion')
  assert.equal(deleted.identifier, identifier, 'issue cleanup delete must return the deleted identifier')
}

async function deleteProject(identifier: string): Promise<void> {
  const deleted = await runCliJson<{ deleted: boolean, identifier: string }>(['project', 'delete', identifier])
  assert.equal(deleted.deleted, true, 'project cleanup delete must confirm deletion')
  assert.equal(deleted.identifier, identifier, 'project cleanup delete must return the deleted identifier')
}

async function runCliJson<T>(args: string[], context: RunContext = {}): Promise<T> {
  return (await runCli<T>(args, context)).data
}

async function runCli<T>(args: string[], context: RunContext = {}): Promise<SuccessPayload<T>> {
  const commandPath = cliPath
  const command = formatCommand(commandPath, args)
  let attempt = 0
  let nextDelayMs = COMMAND_RETRY_DELAY_MS

  for (;;) {
    let stdout = ''
    let stderr = ''
    let exitCode = 0

    try {
      const result = await execFileAsync(process.execPath, [commandPath, ...args], {
        cwd: context.cwd ?? repoRoot,
        env: context.env ?? process.env,
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

      if (isRetryableCliBootstrapFailure(stderr)) {
        if (attempt >= COMMAND_RETRIES) {
          throw new Error(`CLI command ${command} failed after retrying missing built CLI bootstrap:\n${stderr}`)
        }

        attempt += 1
        log(`Retrying transient CLI bootstrap failure (${attempt}/${COMMAND_RETRIES}) for ${command}`)
        await sleep(nextDelayMs)
        nextDelayMs *= 2
        continue
      }

      const payload = parsePayload<never>(stderr, `${command} stderr`)
      if (payload.ok) {
        throw new Error(`CLI command ${command} failed with non-zero exit code ${exitCode} but returned an ok payload.`)
      }

      const cliError = new CliCommandError(commandPath, args, exitCode, payload)

      if (attempt >= COMMAND_RETRIES || !isRetryableCliError(cliError)) {
        throw cliError
      }

      attempt += 1
      log(`Retrying transient failure (${attempt}/${COMMAND_RETRIES}) for ${command}`)
      await sleep(nextDelayMs)
      nextDelayMs *= 2
      continue
    }

    if (stderr.trim().length > 0) {
      throw new Error(`CLI command ${command} wrote unexpected stderr:\n${stderr}`)
    }

    const payload = parsePayload<T>(stdout, `${command} stdout`)
    if (!payload.ok) {
      throw new CliCommandError(commandPath, args, exitCode, payload)
    }

    return payload
  }
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

function expectBoolean(value: unknown, label: string): boolean {
  assert.equal(typeof value, 'boolean', `${label} must be a boolean`)
  return value
}

function readString(value: unknown, key: string): string {
  const record = expectRecord(value, `raw document for key ${key}`)
  return expectString(record[key], `raw document field ${key}`)
}

function formatCommand(commandPath: string, args: string[]): string {
  return `node ${commandPath} ${args.map((arg) => JSON.stringify(arg)).join(' ')}`
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
