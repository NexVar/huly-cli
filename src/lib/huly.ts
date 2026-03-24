import { markdown } from '@hcengineering/api-client'
import contact, { AvatarType, getPersonBySocialKey, type Person as HulyPerson } from '@hcengineering/contact'
import core, { SocialIdType, SortingOrder, buildSocialIdString, generateId, type Ref, type Status } from '@hcengineering/core'
import document, { getFirstRank, type Document as HulyDocument, type Teamspace } from '@hcengineering/document'
import { makeRank } from '@hcengineering/rank'
import task from '@hcengineering/task'
import tracker, { IssuePriority, MilestoneStatus, type Issue, type Milestone, type Project } from '@hcengineering/tracker'
import type { HulyClient } from './client'
import { CliError } from './output'
import type { ChannelSummary, DocumentSummary, IssueSummary, MemberSummary, MilestoneSummary, PersonSummary, ProjectSummary, TeamspaceSummary } from './types'

const ISSUE_PRIORITY_LABELS: Record<number, string> = {
  [IssuePriority.NoPriority]: 'NoPriority',
  [IssuePriority.Urgent]: 'Urgent',
  [IssuePriority.High]: 'High',
  [IssuePriority.Medium]: 'Medium',
  [IssuePriority.Low]: 'Low'
}

const MILESTONE_STATUS_LABELS: Record<number, string> = {
  [MilestoneStatus.Planned]: 'Planned',
  [MilestoneStatus.InProgress]: 'InProgress',
  [MilestoneStatus.Completed]: 'Completed',
  [MilestoneStatus.Canceled]: 'Canceled'
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

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function extractEmail(socialKeys: string[]): string | null {
  const emailKey = socialKeys.find((value) => value.startsWith('email:'))
  return emailKey ? emailKey.slice('email:'.length) : null
}

const CHANNEL_TYPE_BY_PROVIDER = new Map<string, string>([
  [contact.channelProvider.Email, 'email'],
  [contact.channelProvider.Phone, 'phone'],
  [contact.channelProvider.LinkedIn, 'linkedin'],
  [contact.channelProvider.Twitter, 'twitter'],
  [contact.channelProvider.Telegram, 'telegram'],
  [contact.channelProvider.GitHub, 'github'],
  [contact.channelProvider.Facebook, 'facebook'],
  [contact.channelProvider.Homepage, 'homepage'],
  [contact.channelProvider.Whatsapp, 'whatsapp'],
  [contact.channelProvider.Skype, 'skype'],
  [contact.channelProvider.Profile, 'profile'],
  [contact.channelProvider.Viber, 'viber']
])

async function findEmailForPerson(client: HulyClient, personId: string): Promise<string | null> {
  const identities = await client.findAll(contact.class.SocialIdentity, { attachedTo: personId as never })
  const email = identities.find((identity) => identity.type === 'email')
  return email?.value ?? null
}

function getChannelType(providerId: string, providerName: string | null): string {
  const knownType = CHANNEL_TYPE_BY_PROVIDER.get(providerId)
  if (knownType) {
    return knownType
  }

  return providerName ? normalizeString(providerName).replace(/\s+/g, '-') : providerId
}

async function getChannelMapForPersons(
  client: HulyClient,
  personIds: string[]
): Promise<Map<string, ChannelSummary[]>> {
  const result = new Map<string, ChannelSummary[]>(personIds.map((personId) => [personId, []]))

  if (personIds.length === 0) {
    return result
  }

  const channels = await client.findAll(contact.class.Channel, {
    attachedTo: { $in: personIds as never[] }
  }, {
    limit: Math.max(personIds.length * 10, 100),
    sort: { value: SortingOrder.Ascending }
  })

  const providerIds = Array.from(new Set(channels.map((channel) => channel.provider)))
  const providers = providerIds.length > 0
    ? await client.findAll(contact.class.ChannelProvider, { _id: { $in: providerIds as never[] } })
    : []
  const providerNameById = new Map<string, string | null>(
    providers.map((provider) => [provider._id, 'name' in provider ? normalizeOptionalString(provider.name as string | undefined) : null])
  )

  for (const channel of channels) {
    result.get(channel.attachedTo)?.push({
      type: getChannelType(channel.provider, providerNameById.get(channel.provider) ?? null),
      value: channel.value
    })
  }

  return result
}

export async function getPersonById(client: HulyClient, id: string) {
  const person = await client.findOne(contact.class.Person, { _id: id as never })

  if (!person) {
    throw new CliError('NOT_FOUND', `Person '${id}' not found`, 3)
  }

  return person
}

async function mapPersonSummary(
  client: HulyClient,
  person: { _id: string, name: string, city?: string | null },
  channelMap?: Map<string, ChannelSummary[]>
): Promise<PersonSummary> {
  const resolvedChannelMap = channelMap ?? await getChannelMapForPersons(client, [person._id])

  return {
    id: person._id,
    name: person.name,
    city: normalizeOptionalString(person.city),
    channels: resolvedChannelMap.get(person._id) ?? []
  }
}

export function parsePriority(value: string): IssuePriority {
  const normalized = normalizeString(value)
  const entry = Object.entries(ISSUE_PRIORITY_LABELS).find(([, label]) => normalizeString(label) === normalized)

  if (!entry) {
    throw new CliError('VALIDATION_ERROR', `Unsupported priority: ${value}`, 4)
  }

  return Number(entry[0]) as IssuePriority
}

export function parseMilestoneStatus(value: string): MilestoneStatus {
  const normalized = normalizeString(value)
  const entry = Object.entries(MILESTONE_STATUS_LABELS).find(([, label]) => normalizeString(label) === normalized)

  if (!entry) {
    throw new CliError('VALIDATION_ERROR', `Unsupported milestone status: ${value}`, 4)
  }

  return Number(entry[0]) as MilestoneStatus
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

export async function getMilestoneById(client: HulyClient, id: string): Promise<Milestone> {
  const milestone = await client.findOne(tracker.class.Milestone, { _id: id as Ref<Milestone> })

  if (!milestone) {
    throw new CliError('NOT_FOUND', `Milestone '${id}' not found`, 3)
  }

  return milestone
}

async function mapMilestoneSummary(
  client: HulyClient,
  milestone: Milestone,
  projectIdentifier?: string
): Promise<MilestoneSummary> {
  const resolvedProjectIdentifier = projectIdentifier ?? (await client.findOne(tracker.class.Project, { _id: milestone.space }))?.identifier ?? null

  return {
    id: milestone._id,
    label: milestone.label,
    status: MILESTONE_STATUS_LABELS[milestone.status] ?? String(milestone.status),
    project: resolvedProjectIdentifier,
    targetDate: timestampToIso(milestone.targetDate)
  }
}

export async function listMilestones(client: HulyClient, projectIdentifier: string): Promise<MilestoneSummary[]> {
  const project = await getProjectByIdentifier(client, projectIdentifier)
  const milestones = await client.findAll(tracker.class.Milestone, { space: project._id }, {
    sort: { targetDate: SortingOrder.Ascending }
  })

  return await Promise.all(milestones.map(async (milestone) => await mapMilestoneSummary(client, milestone, project.identifier)))
}

export async function getMilestoneSummary(client: HulyClient, id: string): Promise<MilestoneSummary> {
  const milestone = await getMilestoneById(client, id)
  return await mapMilestoneSummary(client, milestone)
}

export async function createMilestone(
  client: HulyClient,
  options: {
    projectIdentifier: string
    label: string
    status?: string
    targetDate?: string
  }
): Promise<MilestoneSummary> {
  const project = await getProjectByIdentifier(client, options.projectIdentifier)
  const milestoneId = await client.createDoc(
    tracker.class.Milestone,
    project._id,
    {
      label: options.label,
      status: options.status ? parseMilestoneStatus(options.status) : MilestoneStatus.Planned,
      space: project._id,
      comments: 0,
      targetDate: options.targetDate ? new Date(options.targetDate).getTime() : Date.now()
    } as never
  )

  return await getMilestoneSummary(client, milestoneId)
}

export async function updateMilestone(
  client: HulyClient,
  id: string,
  updates: {
    label?: string
    status?: string
    targetDate?: string
  }
): Promise<MilestoneSummary> {
  const milestone = await getMilestoneById(client, id)
  const operations: Record<string, unknown> = {}

  if (updates.label !== undefined) {
    operations.label = updates.label
  }

  if (updates.status !== undefined) {
    operations.status = parseMilestoneStatus(updates.status)
  }

  if (updates.targetDate !== undefined) {
    operations.targetDate = new Date(updates.targetDate).getTime()
  }

  if (Object.keys(operations).length === 0) {
    throw new CliError('VALIDATION_ERROR', 'No milestone fields were provided to update.', 4)
  }

  await client.updateDoc(tracker.class.Milestone, milestone.space, milestone._id, operations as never)
  return await getMilestoneSummary(client, id)
}

export async function listPersons(client: HulyClient, limit?: number): Promise<PersonSummary[]> {
  const persons = await client.findAll(contact.class.Person, {}, {
    limit: limit ?? 100,
    sort: { name: SortingOrder.Ascending }
  })
  const channelMap = await getChannelMapForPersons(client, persons.map((person) => person._id))

  return await Promise.all(persons.map(async (person) => await mapPersonSummary(client, person, channelMap)))
}

export async function getPersonSummary(client: HulyClient, id: string): Promise<PersonSummary> {
  const person = await getPersonById(client, id)
  return await mapPersonSummary(client, person)
}

export async function createPerson(
  client: HulyClient,
  options: {
    name: string
    city?: string
    email?: string
  }
): Promise<PersonSummary> {
  const normalizedEmail = options.email ? normalizeString(options.email) : undefined

  if (normalizedEmail) {
    const existing = await getPersonBySocialKey(client as never, socialKeyForEmail(normalizedEmail))
    if (existing) {
      throw new CliError('VALIDATION_ERROR', `Email '${normalizedEmail}' is already attached to another person`, 4)
    }
  }

  const personId = generateId<HulyPerson>()

  await client.createDoc(
    contact.class.Person,
    contact.space.Contacts,
    {
      name: options.name,
      city: options.city ?? '',
      avatarType: AvatarType.COLOR
    } as never,
    personId
  )

  if (normalizedEmail) {
    await client.addCollection(
      contact.class.Channel,
      contact.space.Contacts,
      personId,
      contact.class.Person,
      'channels',
      {
        provider: contact.channelProvider.Email,
        value: normalizedEmail
      } as never
    )

    await client.addCollection(
      contact.class.SocialIdentity,
      contact.space.Contacts,
      personId,
      contact.class.Person,
      'socialIds',
      {
        type: SocialIdType.EMAIL,
        value: normalizedEmail,
        key: buildSocialIdString({ type: SocialIdType.EMAIL, value: normalizedEmail }),
        verifiedOn: Date.now(),
        isDeleted: false
      } as never
    )
  }

  return await getPersonSummary(client, personId)
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

export async function getTeamspaceByName(client: HulyClient, name: string): Promise<Teamspace> {
  const teamspace = await client.findOne(document.class.Teamspace, { name })

  if (!teamspace) {
    throw new CliError('NOT_FOUND', `Teamspace '${name}' not found`, 3)
  }

  return teamspace
}

async function mapTeamspace(client: HulyClient, teamspace: Teamspace): Promise<TeamspaceSummary> {
  const spaceType = teamspace.type
    ? await client.findOne(core.class.SpaceType, { _id: teamspace.type })
    : undefined

  return {
    id: teamspace._id,
    name: teamspace.name,
    description: teamspace.description ?? null,
    private: teamspace.private,
    archived: teamspace.archived,
    type: spaceType?.name ?? null
  }
}

async function mapDocument(
  client: HulyClient,
  doc: HulyDocument,
  includeContent: boolean
): Promise<DocumentSummary> {
  const hydrated = await client.findOne(document.class.Document, { _id: doc._id }, {
    lookup: {
      space: document.class.Teamspace
    }
  })

  if (!hydrated) {
    throw new CliError('NOT_FOUND', `Document '${doc._id}' not found`, 3)
  }

  const content = includeContent && hydrated.content
    ? await client.fetchMarkup(hydrated._class, hydrated._id, 'content', hydrated.content, 'markdown')
    : null

  return {
    id: hydrated._id,
    title: hydrated.title,
    content,
    teamspace: hydrated.$lookup?.space?.name ?? null,
    parentId: hydrated.parent === document.ids.NoParent ? null : hydrated.parent,
    rank: hydrated.rank ?? null
  }
}

export async function listTeamspaces(client: HulyClient): Promise<TeamspaceSummary[]> {
  const teamspaces = await client.findAll(document.class.Teamspace, {}, {
    sort: { name: SortingOrder.Ascending }
  })

  return await Promise.all(teamspaces.map(async (teamspace) => await mapTeamspace(client, teamspace)))
}

export async function createTeamspace(
  client: HulyClient,
  options: {
    name: string
    description?: string
    private?: boolean
  }
): Promise<TeamspaceSummary> {
  const existing = await client.findOne(document.class.Teamspace, { name: options.name })
  if (existing) {
    throw new CliError('VALIDATION_ERROR', `Teamspace '${options.name}' already exists`, 4)
  }

  const teamspaceId = await client.createDoc(
    document.class.Teamspace,
    core.space.Space,
    {
      name: options.name,
      description: options.description ?? '',
      private: options.private ?? false,
      archived: false,
      members: [],
      owners: [],
      autoJoin: !(options.private ?? false),
      restricted: options.private ?? false,
      type: document.spaceType.DefaultTeamspaceType
    } as never
  )

  const teamspace = await client.findOne(document.class.Teamspace, { _id: teamspaceId })
  if (!teamspace) {
    throw new CliError('GENERAL_ERROR', `Failed to load created teamspace '${options.name}'`, 1)
  }

  return await mapTeamspace(client, teamspace)
}

export async function getDocumentById(client: HulyClient, id: string): Promise<HulyDocument> {
  const doc = await client.findOne(document.class.Document, { _id: id as Ref<HulyDocument> })

  if (!doc) {
    throw new CliError('NOT_FOUND', `Document '${id}' not found`, 3)
  }

  return doc
}

export async function listDocuments(
  client: HulyClient,
  options: {
    teamspaceName: string
    limit?: number
    sort?: string
  }
): Promise<DocumentSummary[]> {
  const teamspace = await getTeamspaceByName(client, options.teamspaceName)
  const sortField = options.sort && options.sort.startsWith('-') ? options.sort.slice(1) : options.sort ?? 'modifiedOn'
  const sortDirection = options.sort?.startsWith('-') ? SortingOrder.Descending : SortingOrder.Ascending

  const docs = await client.findAll(document.class.Document, { space: teamspace._id }, {
    limit: options.limit ?? 20,
    sort: {
      [sortField]: sortDirection
    }
  })

  return await Promise.all(docs.map(async (doc) => await mapDocument(client, doc, true)))
}

export async function getDocumentSummary(client: HulyClient, id: string): Promise<DocumentSummary> {
  const doc = await getDocumentById(client, id)
  return await mapDocument(client, doc, true)
}

export async function createDocument(
  client: HulyClient,
  options: {
    teamspaceName: string
    title: string
    content?: string
  }
): Promise<DocumentSummary> {
  const teamspace = await getTeamspaceByName(client, options.teamspaceName)
  const lastRank = await getFirstRank(client as never, teamspace._id, document.ids.NoParent, SortingOrder.Descending)
  const docId = generateId<HulyDocument>()

  await client.createDoc(
    document.class.Document,
    teamspace._id,
    {
      title: options.title,
      content: options.content ? markdown(options.content) : null,
      parent: document.ids.NoParent,
      rank: makeRank(lastRank, undefined)
    } as never,
    docId
  )

  return await getDocumentSummary(client, docId)
}

export async function updateDocument(
  client: HulyClient,
  id: string,
  updates: {
    title?: string
    content?: string
  }
): Promise<DocumentSummary> {
  const doc = await getDocumentById(client, id)
  const operations: Record<string, unknown> = {}

  if (updates.title !== undefined) {
    operations.title = updates.title
  }

  if (updates.content !== undefined) {
    operations.content = markdown(updates.content)
  }

  if (Object.keys(operations).length === 0) {
    throw new CliError('VALIDATION_ERROR', 'No document fields were provided to update.', 4)
  }

  await client.updateDoc(document.class.Document, doc.space, doc._id, operations as never)
  return await getDocumentSummary(client, id)
}

export async function deleteDocument(client: HulyClient, id: string): Promise<{ deleted: true, id: string }> {
  const doc = await getDocumentById(client, id)
  await client.removeDoc(document.class.Document, doc.space, doc._id)
  return { deleted: true, id }
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
