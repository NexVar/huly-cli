import { markdown } from '@hcengineering/api-client'
import contact, { getPersonBySocialKey } from '@hcengineering/contact'
import core, { SortingOrder, generateId, type Ref, type Status } from '@hcengineering/core'
import { makeRank } from '@hcengineering/rank'
import task from '@hcengineering/task'
import tracker, { IssuePriority, type Issue, type Project } from '@hcengineering/tracker'
import type { HulyClient } from './client'
import { CliError } from './output'
import type { IssueSummary, MemberSummary, ProjectSummary } from './types'

const ISSUE_PRIORITY_LABELS: Record<number, string> = {
  [IssuePriority.NoPriority]: 'NoPriority',
  [IssuePriority.Urgent]: 'Urgent',
  [IssuePriority.High]: 'High',
  [IssuePriority.Medium]: 'Medium',
  [IssuePriority.Low]: 'Low'
}

function normalizeString(value: string): string {
  return value.trim().toLowerCase()
}

function timestampToIso(value: number | null | undefined): string | null {
  return typeof value === 'number' ? new Date(value).toISOString() : null
}

function socialKeyForEmail(email: string): string {
  return `email:${normalizeString(email)}`
}

function extractEmail(socialKeys: string[]): string | null {
  const emailKey = socialKeys.find((value) => value.startsWith('email:'))
  return emailKey ? emailKey.slice('email:'.length) : null
}

async function findEmailForPerson(client: HulyClient, personId: string): Promise<string | null> {
  const identities = await client.findAll(contact.class.SocialIdentity, { attachedTo: personId as never })
  const email = identities.find((identity) => identity.type === 'email')
  return email?.value ?? null
}

export function parsePriority(value: string): IssuePriority {
  const normalized = normalizeString(value)
  const entry = Object.entries(ISSUE_PRIORITY_LABELS).find(([, label]) => normalizeString(label) === normalized)

  if (!entry) {
    throw new CliError('VALIDATION_ERROR', `Unsupported priority: ${value}`, 4)
  }

  return Number(entry[0]) as IssuePriority
}

export async function getProjectByIdentifier(client: HulyClient, identifier: string): Promise<Project> {
  const project = await client.findOne(tracker.class.Project, { identifier })

  if (!project) {
    throw new CliError('NOT_FOUND', `Project '${identifier}' not found`, 3)
  }

  return project
}

export async function getProjectStatusName(
  client: HulyClient,
  project: Pick<Project, '_id' | 'defaultIssueStatus'>
): Promise<string | null> {
  if (!project.defaultIssueStatus) {
    return null
  }

  const status = await client.findOne(core.class.Status, { _id: project.defaultIssueStatus as Ref<Status> })
  return status?.name ?? null
}

export async function listProjects(client: HulyClient): Promise<ProjectSummary[]> {
  const projects = await client.findAll(tracker.class.Project, {}, {
    sort: { identifier: SortingOrder.Ascending }
  })

  return Promise.all(projects.map(async (project) => {
    const defaultIssueStatus = await getProjectStatusName(client, project)
    return {
      id: project._id,
      identifier: project.identifier,
      name: 'name' in project ? (project.name as string | undefined) ?? null : null,
      description: 'description' in project ? (project.description as string | undefined) ?? null : null,
      defaultIssueStatus
    }
  }))
}

export async function getProjectSummary(client: HulyClient, identifier: string): Promise<ProjectSummary> {
  const project = await getProjectByIdentifier(client, identifier)
  const defaultIssueStatus = await getProjectStatusName(client, project)

  return {
    id: project._id,
    identifier: project.identifier,
    name: 'name' in project ? (project.name as string | undefined) ?? null : null,
    description: 'description' in project ? (project.description as string | undefined) ?? null : null,
    defaultIssueStatus
  }
}

async function findPersonByEmail(client: HulyClient, email: string) {
  return await getPersonBySocialKey(client as never, socialKeyForEmail(email))
}

async function resolveAssigneeRef(client: HulyClient, email: string | undefined): Promise<Ref<any> | null | undefined> {
  if (email === undefined) {
    return undefined
  }

  const person = await findPersonByEmail(client, email)
  if (!person) {
    throw new CliError('NOT_FOUND', `Assignee '${email}' not found`, 3)
  }

  return person._id
}

async function loadStatusForProject(client: HulyClient, projectId: Ref<Project>, name: string): Promise<Ref<Status>> {
  const projectWithType = await client.findOne(tracker.class.Project, { _id: projectId }, {
    lookup: { type: task.class.ProjectType }
  })

  const statusIds = projectWithType?.$lookup?.type?.statuses?.map((status) => status._id as Ref<Status>) ?? []
  if (statusIds.length === 0) {
    throw new CliError('NOT_FOUND', `Status '${name}' not found`, 3)
  }

  const statuses = await client.findAll(core.class.Status, { _id: { $in: statusIds } })
  const status = statuses.find((entry) => normalizeString(entry.name) === normalizeString(name))

  if (!status) {
    throw new CliError('NOT_FOUND', `Status '${name}' not found`, 3)
  }

  return status._id
}

async function mapIssue(client: HulyClient, issue: Issue, includeDescription: boolean): Promise<IssueSummary> {
  const hydrated = await client.findOne(tracker.class.Issue, { _id: issue._id }, {
    lookup: {
      status: core.class.Status,
      assignee: contact.class.Person,
      space: tracker.class.Project
    }
  })

  if (!hydrated) {
    throw new CliError('NOT_FOUND', `Issue '${issue.identifier}' not found`, 3)
  }

  const description = includeDescription && hydrated.description
    ? await client.fetchMarkup(hydrated._class, hydrated._id, 'description', hydrated.description, 'markdown')
    : null

  return {
    id: hydrated._id,
    identifier: hydrated.identifier,
    title: hydrated.title,
    description,
    status: hydrated.$lookup?.status?.name ?? null,
    priority: ISSUE_PRIORITY_LABELS[hydrated.priority] ?? hydrated.priority,
    assignee: hydrated.$lookup?.assignee?.name ?? null,
    assigneeId: hydrated.assignee ?? null,
    project: hydrated.$lookup?.space?.identifier ?? null,
    dueDate: timestampToIso(hydrated.dueDate),
    number: hydrated.number ?? null
  }
}

export async function getIssueByIdentifier(client: HulyClient, identifier: string): Promise<Issue> {
  const issue = await client.findOne(tracker.class.Issue, { identifier })

  if (!issue) {
    throw new CliError('NOT_FOUND', `Issue '${identifier}' not found`, 3)
  }

  return issue
}

export async function listIssues(
  client: HulyClient,
  options: {
    projectIdentifier: string
    status?: string
    assignee?: string
    priority?: string
    limit?: number
    sort?: string
  }
): Promise<IssueSummary[]> {
  const project = await getProjectByIdentifier(client, options.projectIdentifier)
  const query: Record<string, unknown> = { space: project._id }

  if (options.status) {
    query.status = await loadStatusForProject(client, project._id, options.status)
  }

  if (options.assignee) {
    query.assignee = await resolveAssigneeRef(client, options.assignee)
  }

  if (options.priority) {
    query.priority = parsePriority(options.priority)
  }

  const sortField = options.sort && options.sort.startsWith('-') ? options.sort.slice(1) : options.sort ?? 'modifiedOn'
  const sortDirection = options.sort?.startsWith('-') ? SortingOrder.Descending : SortingOrder.Ascending

  const issues = await client.findAll(tracker.class.Issue, query as never, {
    limit: options.limit ?? 20,
    sort: {
      [sortField]: sortDirection
    }
  })

  return await Promise.all(issues.map(async (issue) => await mapIssue(client, issue, false)))
}

export async function getIssueSummary(client: HulyClient, identifier: string): Promise<IssueSummary> {
  const issue = await getIssueByIdentifier(client, identifier)
  return await mapIssue(client, issue, true)
}

export async function createIssue(
  client: HulyClient,
  options: {
    projectIdentifier: string
    title: string
    description?: string
    priority?: string
    assignee?: string
    dueDate?: string
  }
): Promise<IssueSummary> {
  const project = await getProjectByIdentifier(client, options.projectIdentifier)
  const assignee = await resolveAssigneeRef(client, options.assignee)
  const incrementResult = await client.updateDoc(
    tracker.class.Project,
    core.space.Space,
    project._id,
    { $inc: { sequence: 1 } } as never,
    true
  ) as { object?: { sequence?: number } }

  const sequence = incrementResult.object?.sequence
  if (sequence === undefined) {
    throw new CliError('GENERAL_ERROR', 'Failed to allocate the next issue number', 1)
  }

  const lastIssue = await client.findOne(tracker.class.Issue, { space: project._id }, {
    sort: { rank: SortingOrder.Descending }
  })

  const issueId = generateId<Issue>()

  await client.addCollection(
    tracker.class.Issue,
    project._id,
    project._id,
    project._class,
    'issues',
    {
      title: options.title,
      description: options.description ? markdown(options.description) : null,
      status: project.defaultIssueStatus,
      number: sequence,
      kind: tracker.taskTypes.Issue,
      identifier: `${project.identifier}-${sequence}`,
      priority: options.priority ? parsePriority(options.priority) : IssuePriority.NoPriority,
      assignee: assignee ?? null,
      component: null,
      estimation: 0,
      remainingTime: 0,
      reportedTime: 0,
      reports: 0,
      subIssues: 0,
      parents: [],
      childInfo: [],
      dueDate: options.dueDate ? new Date(options.dueDate).getTime() : null,
      rank: makeRank(lastIssue?.rank, undefined)
    } as never,
    issueId
  )

  return await getIssueSummary(client, `${project.identifier}-${sequence}`)
}

export async function updateIssue(
  client: HulyClient,
  identifier: string,
  updates: {
    title?: string
    description?: string
    status?: string
    priority?: string
    assignee?: string
    dueDate?: string
  }
): Promise<IssueSummary> {
  const issue = await getIssueByIdentifier(client, identifier)
  const operations: Record<string, unknown> = {}

  if (updates.title !== undefined) {
    operations.title = updates.title
  }

  if (updates.description !== undefined) {
    operations.description = markdown(updates.description)
  }

  if (updates.status !== undefined) {
    operations.status = await loadStatusForProject(client, issue.space as Ref<Project>, updates.status)
  }

  if (updates.priority !== undefined) {
    operations.priority = parsePriority(updates.priority)
  }

  if (updates.assignee !== undefined) {
    operations.assignee = await resolveAssigneeRef(client, updates.assignee)
  }

  if (updates.dueDate !== undefined) {
    operations.dueDate = new Date(updates.dueDate).getTime()
  }

  if (Object.keys(operations).length === 0) {
    throw new CliError('VALIDATION_ERROR', 'No issue fields were provided to update.', 4)
  }

  await client.updateDoc(tracker.class.Issue, issue.space as Ref<Project>, issue._id, operations as never)
  return await getIssueSummary(client, identifier)
}

export async function deleteIssue(client: HulyClient, identifier: string): Promise<{ deleted: true, identifier: string }> {
  const issue = await getIssueByIdentifier(client, identifier)
  await client.removeDoc(tracker.class.Issue, issue.space as Ref<Project>, issue._id)
  return { deleted: true, identifier }
}

export async function listMembers(client: HulyClient, limit?: number): Promise<MemberSummary[]> {
  const employees = await client.findAll(contact.mixin.Employee, {}, {
    limit: limit ?? 100,
    sort: { name: SortingOrder.Ascending }
  })

  return await Promise.all(employees.map(async (employee) => {
    return {
      id: employee._id,
      name: employee.name,
      role: employee.role ?? null,
      email: await findEmailForPerson(client, employee._id),
      active: employee.active ?? null,
      personUuid: employee.personUuid ?? null
    }
  }))
}

export async function getCurrentMember(client: HulyClient): Promise<Record<string, unknown>> {
  const account = await client.getAccount()
  const member = await client.findOne(contact.mixin.Employee, { personUuid: account.uuid as never })

  return {
    account,
    member: member
      ? {
          id: member._id,
          name: member.name
        }
      : null
  }
}
