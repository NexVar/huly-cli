import { markdown } from '@hcengineering/api-client'
import card, { type Card as HulyCard, type CardSpace, type MasterTag } from '@hcengineering/card'
import chunter, { type Channel as HulyChatChannel, type ChatMessage, type DirectMessage as HulyDirectMessage } from '@hcengineering/chunter'
import contact, { AvatarType, getPersonBySocialKey, type Person as HulyPerson } from '@hcengineering/contact'
import core, { SocialIdType, SortingOrder, buildSocialIdString, generateId, type Class, type Doc, type Ref, type Space, type Status } from '@hcengineering/core'
import document, { getFirstRank, type Document as HulyDocument, type Teamspace } from '@hcengineering/document'
import notification, { type InboxNotification } from '@hcengineering/notification'
import { makeRank } from '@hcengineering/rank'
import task from '@hcengineering/task'
import tags, { type TagElement, type TagReference } from '@hcengineering/tags'
import { jsonToMarkup, markupToJSON } from '@hcengineering/text'
import { markdownToMarkup, markupToMarkdown } from '@hcengineering/text-markdown'
import time, { ToDoPriority, type ToDo } from '@hcengineering/time'
import tracker, { IssuePriority, MilestoneStatus, type Component, type Issue, type Milestone, type Project } from '@hcengineering/tracker'
import { connectClient, type HulyClient } from './client'
import { CliError } from './output'
import type { CardSummary, CardTypeSummary, ChannelSummary, ChatMessageSummary, ChatSpaceSummary, CommentSummary, ComponentSummary, DocumentSummary, IssueSummary, LabelSummary, MemberSummary, MilestoneSummary, NotificationSummary, PersonSummary, ProjectSummary, TeamspaceSummary, TimeTodoSummary } from './types'

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

const TODO_PRIORITY_LABELS: Record<number, string> = {
  [ToDoPriority.High]: 'High',
  [ToDoPriority.Medium]: 'Medium',
  [ToDoPriority.Low]: 'Low',
  [ToDoPriority.NoPriority]: 'NoPriority',
  [ToDoPriority.Urgent]: 'Urgent'
}

const CARD_TYPE_LABELS = new Map<string, string>([
  [card.class.Card, 'Card'],
  [card.types.Document, 'Document'],
  [card.types.File, 'File'],
  [contact.class.UserProfile, 'UserProfile'],
  ['chat:masterTag:Thread', 'Thread'],
  ['communication:type:Direct', 'Direct'],
  ['communication:type:Poll', 'Poll']
])

function normalizeString(value: string): string {
  return value.trim().toLowerCase()
}

function timestampToIso(value: number | null | undefined): string | null {
  return typeof value === 'number' ? new Date(value).toISOString() : null
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
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

function normalizeUnknownString(value: unknown): string | null {
  return typeof value === 'string' ? normalizeOptionalString(value) : null
}

function normalizeUnknownRef(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function markdownToInlineMarkup(value: string): string {
  return jsonToMarkup(markdownToMarkup(value))
}

function inlineMarkupToMarkdown(value: string): string {
  return markupToMarkdown(markupToJSON(value))
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

async function resolveEmployeeRef(client: HulyClient, email: string | undefined): Promise<Ref<any> | null | undefined> {
  if (email === undefined) {
    return undefined
  }

  const person = await findPersonByEmail(client, email)
  if (!person) {
    throw new CliError('NOT_FOUND', `Assignee '${email}' not found`, 3)
  }

  const employee = await client.findOne(contact.mixin.Employee, { _id: person._id as never })
  if (!employee) {
    throw new CliError('NOT_FOUND', `Assignee '${email}' is not a workspace member`, 3)
  }

  return employee._id
}

async function getCurrentEmployeeRef(client: HulyClient): Promise<Ref<any>> {
  const account = await client.getAccount()
  const employee = await client.findOne(contact.mixin.Employee, { personUuid: account.uuid as never })

  if (!employee) {
    throw new CliError('NOT_FOUND', 'Current member not found in the workspace', 3)
  }

  return employee._id
}

function parseTodoPriority(value: string): ToDoPriority {
  switch (normalizeString(value)) {
    case 'high':
      return ToDoPriority.High
    case 'medium':
      return ToDoPriority.Medium
    case 'low':
      return ToDoPriority.Low
    case 'none':
    case 'nopriority':
    case 'no-priority':
      return ToDoPriority.NoPriority
    case 'urgent':
      return ToDoPriority.Urgent
    default:
      throw new CliError('VALIDATION_ERROR', `Unsupported todo priority: ${value}`, 4)
  }
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

async function listIssueLabelReferences(client: HulyClient, issueId: Ref<Issue>): Promise<TagReference[]> {
  return await client.findAll(tags.class.TagReference, { attachedTo: issueId as never }, {
    limit: 100,
    sort: { title: SortingOrder.Ascending }
  })
}

async function getLabelByTitle(client: HulyClient, title: string): Promise<TagElement> {
  const labels = await client.findAll(tags.class.TagElement, { targetClass: tracker.class.Issue }, {
    limit: 500,
    sort: { title: SortingOrder.Ascending }
  })
  const label = labels.find((entry) => normalizeString(entry.title) === normalizeString(title))

  if (!label) {
    throw new CliError('NOT_FOUND', `Label '${title}' not found`, 3)
  }

  return label
}

async function assignLabelReference(client: HulyClient, issue: Issue, label: TagElement): Promise<void> {
  const existing = await client.findOne(tags.class.TagReference, {
    attachedTo: issue._id as never,
    tag: label._id as never
  })

  if (existing) {
    return
  }

  await client.addCollection(
    tags.class.TagReference,
    issue.space as Ref<any>,
    issue._id,
    tracker.class.Issue,
    'labels',
    {
      tag: label._id,
      title: label.title,
      color: label.color
    } as never
  )
}

async function assignLabelsByTitle(client: HulyClient, issue: Issue, titles: string[]): Promise<void> {
  for (const title of titles) {
    const label = await getLabelByTitle(client, title)
    await assignLabelReference(client, issue, label)
  }
}

async function resolveMilestoneRef(
  client: HulyClient,
  projectId: Ref<Project>,
  label: string | undefined
): Promise<Ref<Milestone> | null | undefined> {
  if (label === undefined) {
    return undefined
  }

  const milestones = await client.findAll(tracker.class.Milestone, { space: projectId }, {
    limit: 500,
    sort: { label: SortingOrder.Ascending }
  })
  const milestone = milestones.find((entry) => normalizeString(entry.label) === normalizeString(label))

  if (!milestone) {
    throw new CliError('NOT_FOUND', `Milestone '${label}' not found`, 3)
  }

  return milestone._id
}

function mapLabelSummary(label: TagElement): LabelSummary {
  return {
    id: label._id,
    title: label.title,
    color: label.color,
    description: normalizeOptionalString(label.description)
  }
}

async function mapComponentSummary(
  client: HulyClient,
  component: Component
): Promise<ComponentSummary> {
  const description = component.description
    ? await client.fetchMarkup(component._class, component._id, 'description', component.description as never, 'markdown')
    : null

  return {
    id: component._id,
    label: component.label,
    description
  }
}

async function getAuthorNameMap(client: HulyClient, ids: string[]): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(ids))

  if (uniqueIds.length === 0) {
    return new Map()
  }

  const people = await client.findAll(contact.class.Person, {
    _id: { $in: uniqueIds as never[] }
  }, {
    limit: uniqueIds.length
  })

  return new Map(people.map((person) => [person._id, person.name]))
}

async function mapCommentSummary(
  client: HulyClient,
  comment: ChatMessage,
  authorNames: Map<string, string>
): Promise<CommentSummary> {
  const message = await client.fetchMarkup(comment._class, comment._id, 'message', comment.message as never, 'markdown')

  return {
    id: comment._id,
    message,
    author: authorNames.get(comment.modifiedBy) ?? comment.modifiedBy,
    createdOn: timestampToIso(comment.createdOn ?? comment.modifiedOn)
  }
}

async function resolveCommentTarget(
  client: HulyClient,
  value: string
): Promise<{ id: Ref<Doc>, objectClass: Ref<Class<Doc>>, space: Ref<Space> }> {
  const issue = await client.findOne(tracker.class.Issue, { identifier: value })

  if (issue) {
    return {
      id: issue._id as Ref<Doc>,
      objectClass: issue._class as Ref<Class<Doc>>,
      space: issue.space as Ref<Space>
    }
  }

  const doc = await client.findOne(document.class.Document, { _id: value as Ref<HulyDocument> })

  if (doc) {
    return {
      id: doc._id as Ref<Doc>,
      objectClass: doc._class as Ref<Class<Doc>>,
      space: doc.space as Ref<Space>
    }
  }

  throw new CliError('NOT_FOUND', `Comment target '${value}' not found`, 3)
}

async function mapIssue(
  client: HulyClient,
  issue: Issue,
  options: { includeDescription: boolean, includeLabels: boolean }
): Promise<IssueSummary> {
  const hydrated = await client.findOne(tracker.class.Issue, { _id: issue._id }, {
    lookup: {
      status: core.class.Status,
      assignee: contact.class.Person,
      space: tracker.class.Project,
      milestone: tracker.class.Milestone
    }
  })

  if (!hydrated) {
    throw new CliError('NOT_FOUND', `Issue '${issue.identifier}' not found`, 3)
  }

  const description = options.includeDescription && hydrated.description
    ? await client.fetchMarkup(hydrated._class, hydrated._id, 'description', hydrated.description, 'markdown')
    : null
  const labels = options.includeLabels
    ? (await listIssueLabelReferences(client, hydrated._id)).map((label) => label.title)
    : []
  const parent = hydrated.parents[0]

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
    number: hydrated.number ?? null,
    milestone: hydrated.$lookup?.milestone?.label ?? null,
    labels,
    parentId: parent?.parentId ?? null,
    parentIdentifier: parent?.identifier ?? null
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

  const account = await client.getAccount()
  const members = options.private ? [account.uuid] : []
  const owners = [account.uuid]

  const teamspaceId = await client.createDoc(
    document.class.Teamspace,
    core.space.Space,
    {
      name: options.name,
      description: options.description ?? '',
      private: options.private ?? false,
      archived: false,
      members,
      owners,
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

  return await Promise.all(issues.map(async (issue) => await mapIssue(client, issue, {
    includeDescription: false,
    includeLabels: false
  })))
}

export async function getIssueSummary(client: HulyClient, identifier: string): Promise<IssueSummary> {
  const issue = await getIssueByIdentifier(client, identifier)
  return await mapIssue(client, issue, {
    includeDescription: true,
    includeLabels: true
  })
}

export async function createIssue(
  client: HulyClient,
  options: {
    projectIdentifier: string
    title: string
    description?: string
    priority?: string
    assignee?: string
    labels?: string[]
    dueDate?: string
    parent?: string
  }
): Promise<IssueSummary> {
  const project = await getProjectByIdentifier(client, options.projectIdentifier)
  const assignee = await resolveAssigneeRef(client, options.assignee)
  const parentIssue = options.parent ? await getIssueByIdentifier(client, options.parent) : undefined

  if (parentIssue && parentIssue.space !== project._id) {
    throw new CliError(
      'VALIDATION_ERROR',
      `Parent issue '${options.parent}' does not belong to project '${options.projectIdentifier}'`,
      4
    )
  }

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
      kind: parentIssue ? tracker.taskTypes.SubIssue : tracker.taskTypes.Issue,
      identifier: `${project.identifier}-${sequence}`,
      priority: options.priority ? parsePriority(options.priority) : IssuePriority.NoPriority,
      assignee: assignee ?? null,
      component: null,
      estimation: 0,
      remainingTime: 0,
      reportedTime: 0,
      reports: 0,
      subIssues: 0,
      parents: parentIssue
        ? [{
            parentId: parentIssue._id,
            identifier: parentIssue.identifier,
            parentTitle: parentIssue.title,
            space: parentIssue.space
          }]
        : [],
      childInfo: [],
      dueDate: options.dueDate ? new Date(options.dueDate).getTime() : null,
      rank: makeRank(lastIssue?.rank, undefined)
    } as never,
    issueId
  )

  const createdIdentifier = `${project.identifier}-${sequence}`
  const createdIssue = await getIssueByIdentifier(client, createdIdentifier)

  if (options.labels && options.labels.length > 0) {
    await assignLabelsByTitle(client, createdIssue, options.labels)
  }

  return await getIssueSummary(client, createdIdentifier)
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
    milestone?: string
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

  if (updates.milestone !== undefined) {
    operations.milestone = await resolveMilestoneRef(client, issue.space as Ref<Project>, updates.milestone)
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

export async function listLabels(client: HulyClient, projectIdentifier?: string): Promise<LabelSummary[]> {
  if (!projectIdentifier) {
    const labels = await client.findAll(tags.class.TagElement, { targetClass: tracker.class.Issue }, {
      limit: 500,
      sort: { title: SortingOrder.Ascending }
    })

    return labels.map(mapLabelSummary)
  }

  const project = await getProjectByIdentifier(client, projectIdentifier)
  const issues = await client.findAll(tracker.class.Issue, { space: project._id }, {
    limit: 10000,
    sort: { modifiedOn: SortingOrder.Descending }
  })

  if (issues.length === 0) {
    return []
  }

  const references = await client.findAll(tags.class.TagReference, {
    attachedTo: { $in: issues.map((issue) => issue._id) as never[] }
  }, {
    limit: Math.max(issues.length * 5, 100),
    sort: { title: SortingOrder.Ascending }
  })
  const labelIds = Array.from(new Set(references.map((reference) => reference.tag)))

  if (labelIds.length === 0) {
    return []
  }

  const labels = await client.findAll(tags.class.TagElement, {
    _id: { $in: labelIds as never[] }
  }, {
    limit: labelIds.length,
    sort: { title: SortingOrder.Ascending }
  })

  return labels
    .filter((label) => label.targetClass === tracker.class.Issue)
    .map(mapLabelSummary)
}

export async function createLabel(
  client: HulyClient,
  options: {
    title: string
    color?: number
    description?: string
  }
): Promise<LabelSummary> {
  const existing = await client.findAll(tags.class.TagElement, { targetClass: tracker.class.Issue }, {
    limit: 500,
    sort: { title: SortingOrder.Ascending }
  })

  if (existing.some((label) => normalizeString(label.title) === normalizeString(options.title))) {
    throw new CliError('VALIDATION_ERROR', `Label '${options.title}' already exists`, 4)
  }

  const labelId = await client.createDoc(tags.class.TagElement, core.space.Space, {
    title: options.title,
    targetClass: tracker.class.Issue,
    description: options.description ?? '',
    color: options.color ?? 0,
    category: tracker.category.Other
  } as never)
  const label = await client.findOne(tags.class.TagElement, { _id: labelId })

  if (!label) {
    throw new CliError('GENERAL_ERROR', `Failed to load created label '${options.title}'`, 1)
  }

  return mapLabelSummary(label)
}

export async function assignLabelToIssue(
  client: HulyClient,
  identifier: string,
  labelTitle: string
): Promise<{ assigned: true, issue: string, label: string }> {
  const issue = await getIssueByIdentifier(client, identifier)
  const label = await getLabelByTitle(client, labelTitle)
  await assignLabelReference(client, issue, label)

  return {
    assigned: true,
    issue: identifier,
    label: label.title
  }
}

export async function listComponents(client: HulyClient, projectIdentifier: string): Promise<ComponentSummary[]> {
  const project = await getProjectByIdentifier(client, projectIdentifier)
  const components = await client.findAll(tracker.class.Component, { space: project._id }, {
    limit: 500,
    sort: { label: SortingOrder.Ascending }
  })

  return await Promise.all(components.map(async (component) => await mapComponentSummary(client, component)))
}

export async function createComponent(
  client: HulyClient,
  options: {
    projectIdentifier: string
    label: string
    description?: string
  }
): Promise<ComponentSummary> {
  const project = await getProjectByIdentifier(client, options.projectIdentifier)
  const existing = await client.findAll(tracker.class.Component, { space: project._id }, {
    limit: 500,
    sort: { label: SortingOrder.Ascending }
  })

  if (existing.some((component) => normalizeString(component.label) === normalizeString(options.label))) {
    throw new CliError('VALIDATION_ERROR', `Component '${options.label}' already exists in project '${options.projectIdentifier}'`, 4)
  }

  const componentId = await client.createDoc(tracker.class.Component, project._id, {
    label: options.label,
    description: options.description ? markdown(options.description) : null,
    lead: null,
    comments: 0,
    attachments: 0
  } as never)
  const component = await client.findOne(tracker.class.Component, { _id: componentId })

  if (!component) {
    throw new CliError('GENERAL_ERROR', `Failed to load created component '${options.label}'`, 1)
  }

  return await mapComponentSummary(client, component)
}

export async function listComments(client: HulyClient, target: string): Promise<CommentSummary[]> {
  const resolvedTarget = await resolveCommentTarget(client, target)
  const comments = await client.findAll(chunter.class.ChatMessage, {
    attachedTo: resolvedTarget.id as never,
    attachedToClass: resolvedTarget.objectClass as never,
    collection: 'comments' as never
  }, {
    limit: 500,
    sort: { createdOn: SortingOrder.Ascending }
  })
  const authorNames = await getAuthorNameMap(client, comments.map((comment) => comment.modifiedBy))

  return await Promise.all(comments.map(async (comment) => await mapCommentSummary(client, comment, authorNames)))
}

export async function addComment(
  client: HulyClient,
  options: {
    on: string
    message: string
  }
): Promise<CommentSummary> {
  const target = await resolveCommentTarget(client, options.on)
  const commentId = await client.addCollection(
    chunter.class.ChatMessage,
    target.space,
    target.id,
    target.objectClass,
    'comments',
    {
      message: markdown(options.message)
    } as never
  )
  const comment = await client.findOne(chunter.class.ChatMessage, { _id: commentId as Ref<ChatMessage> })

  if (!comment) {
    throw new CliError('GENERAL_ERROR', `Failed to load created comment on '${options.on}'`, 1)
  }

  const authorNames = await getAuthorNameMap(client, [comment.modifiedBy])
  return await mapCommentSummary(client, comment, authorNames)
}

async function getNotificationById(client: HulyClient, id: string): Promise<InboxNotification> {
  const account = await client.getAccount()
  const notificationDoc = await client.findOne(notification.class.InboxNotification, {
    _id: id as Ref<InboxNotification>,
    user: account.uuid as never
  })

  if (!notificationDoc) {
    throw new CliError('NOT_FOUND', `Notification '${id}' not found`, 3)
  }

  return notificationDoc
}

function mapNotificationSummary(notificationDoc: InboxNotification): NotificationSummary {
  const attachedTo = 'attachedTo' in notificationDoc ? normalizeUnknownRef(notificationDoc.attachedTo) : null
  const attachedToClass = 'attachedToClass' in notificationDoc ? normalizeUnknownRef(notificationDoc.attachedToClass) : null

  return {
    id: notificationDoc._id,
    class: notificationDoc._class,
    title: normalizeUnknownString(notificationDoc.title),
    body: normalizeUnknownString(notificationDoc.body),
    isViewed: notificationDoc.isViewed,
    archived: notificationDoc.archived,
    objectId: notificationDoc.objectId,
    objectClass: notificationDoc.objectClass,
    attachedTo,
    attachedToClass,
    contextId: notificationDoc.docNotifyContext,
    types: notificationDoc.types ?? [],
    createdOn: timestampToIso(notificationDoc.createdOn),
    modifiedOn: timestampToIso(notificationDoc.modifiedOn),
    intlParams: notificationDoc.intlParams ?? null,
    intlParamsNotLocalized: notificationDoc.intlParamsNotLocalized ?? null
  }
}

export async function listNotifications(
  client: HulyClient,
  options: {
    limit?: number
    isViewed?: boolean
    archived?: boolean
  }
): Promise<NotificationSummary[]> {
  const account = await client.getAccount()
  const notifications = await client.findAll(notification.class.InboxNotification, {
    user: account.uuid as never,
    ...(options.isViewed === undefined ? {} : { isViewed: options.isViewed as never }),
    ...(options.archived === undefined ? {} : { archived: options.archived as never })
  }, {
    limit: options.limit ?? 20,
    sort: { modifiedOn: SortingOrder.Descending }
  })

  return notifications.map((notificationDoc) => mapNotificationSummary(notificationDoc))
}

export async function getNotificationSummary(client: HulyClient, id: string): Promise<NotificationSummary> {
  return mapNotificationSummary(await getNotificationById(client, id))
}

async function updateNotification(
  client: HulyClient,
  id: string,
  operations: Partial<Pick<InboxNotification, 'isViewed' | 'archived'>>
): Promise<NotificationSummary> {
  const notificationDoc = await getNotificationById(client, id)
  await client.updateDoc(notification.class.InboxNotification, notificationDoc.space, notificationDoc._id, operations as never)
  return await getNotificationSummary(client, id)
}

export async function readNotification(client: HulyClient, id: string): Promise<NotificationSummary> {
  return await updateNotification(client, id, { isViewed: true })
}

export async function unreadNotification(client: HulyClient, id: string): Promise<NotificationSummary> {
  return await updateNotification(client, id, { isViewed: false })
}

export async function archiveNotification(client: HulyClient, id: string): Promise<NotificationSummary> {
  return await updateNotification(client, id, { archived: true })
}

export async function unarchiveNotification(client: HulyClient, id: string): Promise<NotificationSummary> {
  return await updateNotification(client, id, { archived: false })
}

async function getEmailMapForPersons(client: HulyClient, personIds: string[]): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>(personIds.map((personId) => [personId, null]))

  if (personIds.length === 0) {
    return result
  }

  const identities = await client.findAll(contact.class.SocialIdentity, {
    attachedTo: { $in: personIds as never[] },
    type: 'email' as never
  }, {
    limit: Math.max(personIds.length * 4, 100),
    sort: { value: SortingOrder.Ascending }
  })

  for (const identity of identities) {
    if (!result.has(identity.attachedTo)) {
      continue
    }

    if (result.get(identity.attachedTo) === null) {
      result.set(identity.attachedTo, identity.value)
    }
  }

  return result
}

async function getTimeTodoById(client: HulyClient, id: string): Promise<ToDo> {
  const todo = await client.findOne(time.class.ToDo, { _id: id as Ref<ToDo> })

  if (!todo) {
    throw new CliError('NOT_FOUND', `Todo '${id}' not found`, 3)
  }

  return todo
}

async function mapTimeTodos(
  client: HulyClient,
  todos: ToDo[],
  options: { includeDescription: boolean }
): Promise<TimeTodoSummary[]> {
  const issueIds = Array.from(new Set(
    todos
      .filter((todo) => todo.attachedToClass === tracker.class.Issue)
      .map((todo) => todo.attachedTo as string)
  ))
  const assigneeIds = Array.from(new Set(todos.map((todo) => todo.user as string)))

  const [issues, assignees] = await Promise.all([
    issueIds.length > 0
      ? client.findAll(tracker.class.Issue, { _id: { $in: issueIds as never[] } }, { limit: issueIds.length })
      : Promise.resolve([]),
    assigneeIds.length > 0
      ? client.findAll(contact.mixin.Employee, { _id: { $in: assigneeIds as never[] } }, { limit: assigneeIds.length })
      : Promise.resolve([])
  ])

  const issueIdentifierById = new Map(issues.map((issue) => [issue._id as string, issue.identifier]))
  const assigneeById = new Map(assignees.map((employee) => [employee._id as string, employee]))
  const emailByAssigneeId = await getEmailMapForPersons(client, assignees.map((employee) => employee._id as string))

  return await Promise.all(todos.map(async (todo) => {
    const description = options.includeDescription && todo.description
      ? inlineMarkupToMarkdown(todo.description)
      : null
    const assignee = assigneeById.get(todo.user as string)

    return {
      id: todo._id,
      class: todo._class,
      title: todo.title,
      description,
      priority: TODO_PRIORITY_LABELS[todo.priority] ?? todo.priority,
      isDone: todo.doneOn !== null,
      doneOn: timestampToIso(todo.doneOn),
      dueDate: timestampToIso(todo.dueDate),
      issue: issueIdentifierById.get(todo.attachedTo as string) ?? null,
      issueId: todo.attachedToClass === tracker.class.Issue ? todo.attachedTo : null,
      assignee: assignee?.name ?? null,
      assigneeEmail: assignee ? emailByAssigneeId.get(assignee._id) ?? null : null,
      assigneeId: typeof todo.user === 'string' ? todo.user : null,
      createdOn: timestampToIso(todo.createdOn),
      modifiedOn: timestampToIso(todo.modifiedOn)
    }
  }))
}

export async function listTimeTodos(
  client: HulyClient,
  options: {
    issueIdentifier?: string
    assignee?: string
    isDone?: boolean
    limit?: number
  }
): Promise<TimeTodoSummary[]> {
  const query: Record<string, unknown> = {
    attachedToClass: tracker.class.Issue,
    collection: 'todos'
  }

  if (options.issueIdentifier !== undefined) {
    const issue = await getIssueByIdentifier(client, options.issueIdentifier)
    query.attachedTo = issue._id
  }

  if (options.assignee !== undefined) {
    query.user = await resolveEmployeeRef(client, options.assignee)
  }

  if (options.isDone === true) {
    query.doneOn = { $gt: 0 }
  } else if (options.isDone === false) {
    query.doneOn = null
  }

  const todos = await client.findAll(time.class.ToDo, query as never, {
    limit: options.limit ?? 20,
    sort: { modifiedOn: SortingOrder.Descending }
  })

  return await mapTimeTodos(client, todos, { includeDescription: false })
}

export async function getTimeTodoSummary(client: HulyClient, id: string): Promise<TimeTodoSummary> {
  const [todo] = await mapTimeTodos(client, [await getTimeTodoById(client, id)], { includeDescription: true })
  return todo
}

export async function createTimeTodo(
  client: HulyClient,
  options: {
    issueIdentifier: string
    title: string
    description?: string
    priority?: string
    assignee?: string
    dueDate?: string
  }
): Promise<TimeTodoSummary> {
  const issue = await getIssueByIdentifier(client, options.issueIdentifier)
  const assignee = (await resolveEmployeeRef(client, options.assignee)) ?? await getCurrentEmployeeRef(client)
  const lastTodo = await client.findOne(time.class.ToDo, {
    attachedTo: issue._id as never,
    attachedToClass: issue._class as never,
    collection: 'todos' as never
  }, {
    sort: { rank: SortingOrder.Descending }
  })

  const todoId = await client.addCollection(
    time.class.ProjectToDo,
    time.space.ToDos,
    issue._id,
    issue._class,
    'todos',
    {
      title: options.title,
      description: options.description ? markdownToInlineMarkup(options.description) : '',
      priority: options.priority ? parseTodoPriority(options.priority) : ToDoPriority.NoPriority,
      dueDate: options.dueDate ? new Date(options.dueDate).getTime() : null,
      doneOn: null,
      visibility: 'public',
      user: assignee,
      workslots: 0,
      attachedSpace: issue.space,
      rank: makeRank(lastTodo?.rank, undefined)
    } as never
  )

  return await getTimeTodoSummary(client, todoId)
}

export async function updateTimeTodo(
  client: HulyClient,
  id: string,
  updates: {
    title?: string
    description?: string
    priority?: string
    assignee?: string
    dueDate?: string
  }
): Promise<TimeTodoSummary> {
  const todo = await getTimeTodoById(client, id)
  const operations: Record<string, unknown> = {}

  if (updates.title !== undefined) {
    operations.title = updates.title
  }

  if (updates.description !== undefined) {
    operations.description = updates.description ? markdownToInlineMarkup(updates.description) : ''
  }

  if (updates.priority !== undefined) {
    operations.priority = parseTodoPriority(updates.priority)
  }

  if (updates.assignee !== undefined) {
    operations.user = await resolveEmployeeRef(client, updates.assignee)
  }

  if (updates.dueDate !== undefined) {
    operations.dueDate = updates.dueDate ? new Date(updates.dueDate).getTime() : null
  }

  if (Object.keys(operations).length === 0) {
    throw new CliError('VALIDATION_ERROR', 'No todo fields were provided to update.', 4)
  }

  await client.updateDoc(todo._class as Ref<Class<ToDo>>, todo.space, todo._id, operations as never)
  return await getTimeTodoSummary(client, id)
}

async function updateTimeTodoState(
  client: HulyClient,
  id: string,
  operations: Partial<Pick<ToDo, 'doneOn'>>
): Promise<TimeTodoSummary> {
  const todo = await getTimeTodoById(client, id)
  await client.updateDoc(todo._class as Ref<Class<ToDo>>, todo.space, todo._id, operations as never)
  return await getTimeTodoSummary(client, id)
}

export async function completeTimeTodo(client: HulyClient, id: string): Promise<TimeTodoSummary> {
  return await updateTimeTodoState(client, id, { doneOn: Date.now() })
}

export async function reopenTimeTodo(client: HulyClient, id: string): Promise<TimeTodoSummary> {
  return await updateTimeTodoState(client, id, { doneOn: null })
}

export async function deleteTimeTodo(client: HulyClient, id: string): Promise<{ deleted: true, id: string }> {
  const todo = await getTimeTodoById(client, id)
  await client.removeDoc(todo._class as Ref<Class<ToDo>>, todo.space, todo._id)
  return { deleted: true, id }
}

function getFallbackCardTypeLabel(typeId: string): string {
  const segments = typeId.split(':')
  return segments[segments.length - 1] || typeId
}

function getCardTypeLabel(typeId: string, typeDoc?: Partial<MasterTag>): string {
  return CARD_TYPE_LABELS.get(typeId)
    ?? normalizeUnknownString((typeDoc as { title?: unknown } | undefined)?.title)
    ?? normalizeUnknownString((typeDoc as { name?: unknown } | undefined)?.name)
    ?? getFallbackCardTypeLabel(typeId)
}

async function getDefaultCardSpace(client: HulyClient): Promise<CardSpace> {
  const space = await client.findOne(card.class.CardSpace, { _id: card.space.Default as Ref<CardSpace> })

  if (!space) {
    throw new CliError('NOT_FOUND', `Card space '${card.space.Default}' not found`, 3)
  }

  return space
}

async function getCardById(client: HulyClient, id: string): Promise<HulyCard> {
  const cardDoc = await client.findOne(card.class.Card, { _id: id as Ref<HulyCard> })

  if (!cardDoc) {
    throw new CliError('NOT_FOUND', `Card '${id}' not found`, 3)
  }

  return cardDoc
}

async function getCardTypesById(
  client: HulyClient,
  typeIds: string[]
): Promise<Map<string, MasterTag | undefined>> {
  const uniqueTypeIds = Array.from(new Set(typeIds))
  const typeById = new Map<string, MasterTag | undefined>(uniqueTypeIds.map((typeId) => [typeId, undefined]))
  const masterTagIds = uniqueTypeIds.filter((typeId) => typeId !== card.class.Card)

  if (masterTagIds.length === 0) {
    return typeById
  }

  const typeDocs = await client.findAll(card.class.MasterTag, {
    _id: { $in: masterTagIds as never[] }
  }, {
    limit: masterTagIds.length
  })

  for (const typeDoc of typeDocs) {
    typeById.set(typeDoc._id, typeDoc)
  }

  return typeById
}

async function resolveCardType(client: HulyClient, value: string | undefined): Promise<string> {
  if (value === undefined) {
    return card.class.Card
  }

  const normalized = normalizeString(value)
  if (normalized.length === 0) {
    throw new CliError('VALIDATION_ERROR', 'Card type cannot be empty.', 4)
  }

  const alias = new Map<string, string>([
    ['card', card.class.Card],
    ['document', card.types.Document],
    ['doc', card.types.Document],
    ['file', card.types.File]
  ]).get(normalized)

  if (alias) {
    return alias
  }

  const defaultSpace = await getDefaultCardSpace(client)
  const availableTypeIds = Array.from(new Set([card.class.Card as string, ...(defaultSpace.types ?? []).map((typeId) => typeId as string)]))

  if (availableTypeIds.includes(value)) {
    return value
  }

  const typeById = await getCardTypesById(client, availableTypeIds)
  const matches = availableTypeIds.filter((typeId) => normalizeString(getCardTypeLabel(typeId, typeById.get(typeId))) === normalized)

  if (matches.length === 1) {
    return matches[0]
  }

  if (matches.length > 1) {
    throw new CliError('VALIDATION_ERROR', `Card type '${value}' is ambiguous. Use the type id instead.`, 4)
  }

  throw new CliError('NOT_FOUND', `Card type '${value}' not found`, 3)
}

async function mapCards(
  client: HulyClient,
  cards: HulyCard[],
  options: { includeContent: boolean }
): Promise<CardSummary[]> {
  const typeIds = Array.from(new Set(cards.map((cardDoc) => cardDoc._class as string)))
  const parentIds = Array.from(new Set(
    cards
      .map((cardDoc) => cardDoc.parent)
      .filter((parentId): parentId is Ref<HulyCard> => parentId !== null && parentId !== undefined)
  ))
  const spaceIds = Array.from(new Set(cards.map((cardDoc) => cardDoc.space as string)))

  const [typeById, parents, spaces] = await Promise.all([
    getCardTypesById(client, typeIds),
    parentIds.length > 0
      ? client.findAll(card.class.Card, { _id: { $in: parentIds as never[] } }, { limit: parentIds.length })
      : Promise.resolve([]),
    spaceIds.length > 0
      ? client.findAll(card.class.CardSpace, { _id: { $in: spaceIds as never[] } }, { limit: spaceIds.length })
      : Promise.resolve([])
  ])

  const parentById = new Map(parents.map((parent) => [parent._id as string, parent]))
  const spaceNameById = new Map(spaces.map((space) => [space._id as string, (space as { name?: string }).name ?? space._id]))

  return await Promise.all(cards.map(async (cardDoc) => ({
    id: cardDoc._id,
    title: cardDoc.title,
    content: options.includeContent && cardDoc.content
      ? await client.fetchMarkup(cardDoc._class as Ref<Class<Doc>>, cardDoc._id, 'content', cardDoc.content, 'markdown')
      : null,
    type: getCardTypeLabel(cardDoc._class as string, typeById.get(cardDoc._class as string)),
    typeId: cardDoc._class,
    space: spaceNameById.get(cardDoc.space as string) ?? cardDoc.space,
    parentId: cardDoc.parent ?? null,
    parentTitle: cardDoc.parent ? parentById.get(cardDoc.parent)?.title ?? null : null,
    children: cardDoc.children ?? null,
    attachments: cardDoc.attachments ?? null,
    rank: cardDoc.rank ?? null,
    createdOn: timestampToIso(cardDoc.createdOn),
    modifiedOn: timestampToIso(cardDoc.modifiedOn)
  })))
}

export async function listCardTypes(client: HulyClient): Promise<CardTypeSummary[]> {
  const defaultSpace = await getDefaultCardSpace(client)
  const typeIds = Array.from(new Set([card.class.Card as string, ...(defaultSpace.types ?? []).map((typeId) => typeId as string)]))
  const typeById = await getCardTypesById(client, typeIds)

  return typeIds.map((typeId) => ({
    id: typeId,
    label: getCardTypeLabel(typeId, typeById.get(typeId)),
    builtin: typeId.startsWith('card:') || typeId.startsWith('contact:') || typeId.startsWith('communication:') || typeId.startsWith('chat:')
  }))
}

export async function listCards(
  client: HulyClient,
  options: {
    type?: string
    parentId?: string
    limit?: number
  }
): Promise<CardSummary[]> {
  const query: Record<string, unknown> = {
    space: card.space.Default
  }

  if (options.type !== undefined) {
    query._class = await resolveCardType(client, options.type)
  }

  if (options.parentId !== undefined) {
    query.parent = (await getCardById(client, options.parentId))._id
  }

  const cards = await client.findAll(card.class.Card, query as never, {
    limit: options.limit ?? 20,
    sort: { modifiedOn: SortingOrder.Descending }
  })

  return await mapCards(client, cards, { includeContent: false })
}

export async function getCardSummary(client: HulyClient, id: string): Promise<CardSummary> {
  const [cardDoc] = await mapCards(client, [await getCardById(client, id)], { includeContent: true })
  return cardDoc
}

export async function createCard(
  client: HulyClient,
  options: {
    title: string
    content?: string
    type?: string
    parentId?: string
  }
): Promise<CardSummary> {
  const cardClass = await resolveCardType(client, options.type)
  const parent = options.parentId ? await getCardById(client, options.parentId) : null
  const siblingsQuery = {
    space: card.space.Default,
    parent: parent?._id ?? null
  }
  const lastCard = await client.findOne(card.class.Card, siblingsQuery as never, {
    sort: { rank: SortingOrder.Descending }
  })
  const parentInfo = parent
    ? [...(parent.parentInfo ?? []), { _id: parent._id, _class: parent._class, title: parent.title }]
    : []

  const id = await client.createDoc(
    cardClass as Ref<Class<HulyCard>>,
    card.space.Default,
    {
      title: options.title,
      content: options.content ? markdown(options.content) : null,
      blobs: {},
      parentInfo,
      parent: parent?._id ?? null,
      rank: makeRank(lastCard?.rank, undefined)
    } as never
  )

  const [summary] = await mapCards(client, [await getCardById(client, id)], { includeContent: false })

  return {
    ...summary,
    content: options.content ?? null
  }
}

export async function updateCard(
  client: HulyClient,
  id: string,
  updates: {
    title?: string
    content?: string
  }
): Promise<CardSummary> {
  const cardDoc = await getCardById(client, id)
  const operations: Record<string, unknown> = {}

  if (updates.title !== undefined) {
    operations.title = updates.title
  }

  if (updates.content !== undefined) {
    operations.content = markdown(updates.content)
  }

  if (Object.keys(operations).length === 0) {
    throw new CliError('VALIDATION_ERROR', 'No card fields were provided to update.', 4)
  }

  await client.updateDoc(cardDoc._class as Ref<Class<HulyCard>>, cardDoc.space, cardDoc._id, operations as never)

  if (updates.content !== undefined) {
    await sleep(6000)
    const [summary] = await mapCards(client, [await getCardById(client, id)], { includeContent: false })
    return {
      ...summary,
      title: updates.title ?? summary.title,
      content: updates.content
    }
  }

  return await getCardSummary(client, id)
}

export async function deleteCard(client: HulyClient, id: string): Promise<{ deleted: true, id: string }> {
  const cardDoc = await getCardById(client, id)
  await client.removeDoc(cardDoc._class as Ref<Class<HulyCard>>, cardDoc.space, cardDoc._id)
  return { deleted: true, id }
}

type ChatSpaceDoc = HulyChatChannel | HulyDirectMessage

function getChatKind(space: Pick<ChatSpaceDoc, '_class'>): 'channel' | 'direct' {
  return space._class === chunter.class.DirectMessage ? 'direct' : 'channel'
}

function mapChatSpaceSummary(space: ChatSpaceDoc): ChatSpaceSummary {
  return {
    id: space._id,
    kind: getChatKind(space),
    name: normalizeOptionalString(space.name),
    description: normalizeOptionalString(space.description),
    topic: 'topic' in space ? normalizeUnknownString(space.topic) : null,
    private: space.private,
    archived: space.archived,
    autoJoin: typeof space.autoJoin === 'boolean' ? space.autoJoin : null,
    members: Array.isArray(space.members) ? [...space.members] : [],
    memberCount: Array.isArray(space.members) ? space.members.length : 0,
    messageCount: typeof space.messages === 'number' ? space.messages : null,
    createdOn: timestampToIso(space.createdOn),
    modifiedOn: timestampToIso(space.modifiedOn)
  }
}

async function getChatSpaceById(client: HulyClient, id: string): Promise<ChatSpaceDoc> {
  const channel = await client.findOne(chunter.class.Channel, { _id: id as Ref<HulyChatChannel> })

  if (channel) {
    return channel
  }

  const directMessage = await client.findOne(chunter.class.DirectMessage, { _id: id as Ref<HulyDirectMessage> })

  if (directMessage) {
    return directMessage
  }

  throw new CliError('NOT_FOUND', `Chat '${id}' not found`, 3)
}

async function resolveChatMemberAccountUuid(client: HulyClient, email: string): Promise<string> {
  const person = await findPersonByEmail(client, email)

  if (!person) {
    throw new CliError('NOT_FOUND', `Member '${email}' not found`, 3)
  }

  const employee = await client.findOne(contact.mixin.Employee, { _id: person._id as never })

  if (!employee || !employee.personUuid) {
    throw new CliError('NOT_FOUND', `Member '${email}' is not a workspace member`, 3)
  }

  return employee.personUuid
}

async function resolveChatMemberAccountUuids(client: HulyClient, emails: string[] | undefined): Promise<string[]> {
  const account = await client.getAccount()
  const values = emails ?? []
  const uuids = values.length === 0
    ? [account.uuid]
    : [account.uuid, ...await Promise.all(values.map(async (email) => await resolveChatMemberAccountUuid(client, email)))]

  return Array.from(new Set(uuids))
}

async function mapChatMessageSummary(
  client: HulyClient,
  message: ChatMessage,
  authorNames: Map<string, string>,
  chatSpace?: ChatSpaceDoc
): Promise<ChatMessageSummary> {
  const resolvedChatSpace = chatSpace ?? await getChatSpaceById(client, message.attachedTo)

  return {
    id: message._id,
    chatId: message.attachedTo,
    chatKind: getChatKind(resolvedChatSpace),
    chatName: normalizeOptionalString(resolvedChatSpace.name),
    message: await client.fetchMarkup(message._class, message._id, 'message', message.message as never, 'markdown'),
    author: authorNames.get(message.modifiedBy) ?? message.modifiedBy,
    authorId: message.modifiedBy,
    createdOn: timestampToIso(message.createdOn),
    modifiedOn: timestampToIso(message.modifiedOn),
    editedOn: timestampToIso(message.editedOn)
  }
}

async function getChatMessageById(client: HulyClient, id: string): Promise<ChatMessage> {
  const message = await client.findOne(chunter.class.ChatMessage, { _id: id as Ref<ChatMessage> })

  if (!message) {
    throw new CliError('NOT_FOUND', `Chat message '${id}' not found`, 3)
  }

  return message
}

async function waitForChatMessageSummary(id: string, expectedMessage: string): Promise<ChatMessageSummary> {
  const { client } = await connectClient()

  try {
    let lastSummary: ChatMessageSummary | undefined

    for (let attempt = 0; attempt < 6; attempt += 1) {
      lastSummary = await getChatMessageSummary(client, id)

      if (lastSummary.message === expectedMessage) {
        return lastSummary
      }

      await sleep(2000)
    }

    return {
      ...(lastSummary ?? await getChatMessageSummary(client, id)),
      message: expectedMessage
    }
  } finally {
    await client.close()
  }
}

export async function listChatSpaces(
  client: HulyClient,
  options: {
    includeDirect?: boolean
    limit?: number
  }
): Promise<ChatSpaceSummary[]> {
  const limit = options.limit ?? 20
  const [channels, directs] = await Promise.all([
    client.findAll(chunter.class.Channel, {}, {
      limit,
      sort: { modifiedOn: SortingOrder.Descending }
    }),
    options.includeDirect
      ? client.findAll(chunter.class.DirectMessage, {}, {
          limit,
          sort: { modifiedOn: SortingOrder.Descending }
        })
      : Promise.resolve([])
  ])

  return [...channels, ...directs]
    .sort((left, right) => (right.modifiedOn ?? 0) - (left.modifiedOn ?? 0))
    .slice(0, limit)
    .map((space) => mapChatSpaceSummary(space))
}

export async function getChatSpaceSummary(client: HulyClient, id: string): Promise<ChatSpaceSummary> {
  return mapChatSpaceSummary(await getChatSpaceById(client, id))
}

export async function createChatChannel(
  client: HulyClient,
  options: {
    name: string
    topic?: string
    description?: string
    private?: boolean
    memberEmails?: string[]
  }
): Promise<ChatSpaceSummary> {
  const members = await resolveChatMemberAccountUuids(client, options.memberEmails)
  const id = await client.createDoc(
    chunter.class.Channel,
    core.space.Space,
    {
      name: options.name,
      description: options.description ?? '',
      private: options.private ?? false,
      archived: false,
      autoJoin: false,
      members,
      topic: options.topic ?? ''
    } as never
  )

  return await getChatSpaceSummary(client, id)
}

export async function updateChatChannel(
  client: HulyClient,
  id: string,
  updates: {
    name?: string
    topic?: string
    description?: string
    private?: boolean
    archived?: boolean
  }
): Promise<ChatSpaceSummary> {
  const channel = await client.findOne(chunter.class.Channel, { _id: id as Ref<HulyChatChannel> })

  if (!channel) {
    throw new CliError('NOT_FOUND', `Channel '${id}' not found`, 3)
  }

  const operations: Record<string, unknown> = {}

  if (updates.name !== undefined) {
    operations.name = updates.name
  }

  if (updates.topic !== undefined) {
    operations.topic = updates.topic
  }

  if (updates.description !== undefined) {
    operations.description = updates.description
  }

  if (updates.private !== undefined) {
    operations.private = updates.private
  }

  if (updates.archived !== undefined) {
    operations.archived = updates.archived
  }

  if (Object.keys(operations).length === 0) {
    throw new CliError('VALIDATION_ERROR', 'No chat channel fields were provided to update.', 4)
  }

  await client.updateDoc(chunter.class.Channel, channel.space, channel._id, operations as never)
  return await getChatSpaceSummary(client, id)
}

export async function deleteChatChannel(client: HulyClient, id: string): Promise<{ deleted: true, id: string }> {
  const channel = await client.findOne(chunter.class.Channel, { _id: id as Ref<HulyChatChannel> })

  if (!channel) {
    throw new CliError('NOT_FOUND', `Channel '${id}' not found`, 3)
  }

  await client.removeDoc(chunter.class.Channel, channel.space, channel._id)
  return { deleted: true, id }
}

export async function listChatMessages(
  client: HulyClient,
  options: {
    chatId: string
    limit?: number
  }
): Promise<ChatMessageSummary[]> {
  const chatSpace = await getChatSpaceById(client, options.chatId)
  const messages = await client.findAll(chunter.class.ChatMessage, {
    attachedTo: chatSpace._id as never,
    attachedToClass: chatSpace._class as never,
    collection: 'messages' as never
  }, {
    limit: options.limit ?? 20,
    sort: { createdOn: SortingOrder.Ascending }
  })
  const authorNames = await getAuthorNameMap(client, messages.map((message) => message.modifiedBy))

  return await Promise.all(messages.map(async (message) => await mapChatMessageSummary(client, message, authorNames, chatSpace)))
}

export async function getChatMessageSummary(client: HulyClient, id: string): Promise<ChatMessageSummary> {
  const message = await getChatMessageById(client, id)
  const authorNames = await getAuthorNameMap(client, [message.modifiedBy])
  return await mapChatMessageSummary(client, message, authorNames)
}

export async function createChatMessage(
  client: HulyClient,
  options: {
    chatId: string
    message: string
  }
): Promise<ChatMessageSummary> {
  const chatSpace = await getChatSpaceById(client, options.chatId)
  const id = await client.addCollection(
    chunter.class.ChatMessage,
    chatSpace.space,
    chatSpace._id,
    chatSpace._class,
    'messages',
    {
      message: markdown(options.message)
    } as never
  )

  return await getChatMessageSummary(client, id)
}

export async function updateChatMessage(
  client: HulyClient,
  id: string,
  updates: {
    message?: string
  }
): Promise<ChatMessageSummary> {
  const message = await getChatMessageById(client, id)

  if (updates.message === undefined) {
    throw new CliError('VALIDATION_ERROR', 'No chat message fields were provided to update.', 4)
  }

  await client.updateDoc(chunter.class.ChatMessage, message.space, message._id, {
    message: markdown(updates.message)
  } as never)

  const summary = await waitForChatMessageSummary(id, updates.message)

  return {
    ...summary,
    message: updates.message
  }
}

export async function deleteChatMessage(client: HulyClient, id: string): Promise<{ deleted: true, id: string }> {
  const message = await getChatMessageById(client, id)
  await client.removeDoc(chunter.class.ChatMessage, message.space, message._id)
  return { deleted: true, id }
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
