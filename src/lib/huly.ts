import { markdown } from '@hcengineering/api-client'
import board from '@hcengineering/board'
import card, { type Card as HulyCard, type CardSpace, type MasterTag, type Role as CardRole } from '@hcengineering/card'
import chunter, { type Channel as HulyChatChannel, type ChatMessage, type DirectMessage as HulyDirectMessage, type ThreadMessage as HulyThreadMessage } from '@hcengineering/chunter'
import contact, { AvatarType, getPersonBySocialKey, type Person as HulyPerson } from '@hcengineering/contact'
import core, { SocialIdType, SortingOrder, buildSocialIdString, generateId, type Class, type Doc, type Ref, type RelatedDocument, type Space, type Status } from '@hcengineering/core'
import document, { getFirstRank, type Document as HulyDocument, type Teamspace } from '@hcengineering/document'
import hr, { fromTzDate, toTzDate } from '@hcengineering/hr'
import notification, { type InboxNotification } from '@hcengineering/notification'
import { makeRank } from '@hcengineering/rank'
import task from '@hcengineering/task'
import tags, { type TagElement, type TagReference } from '@hcengineering/tags'
import { jsonToMarkup, markupToJSON } from '@hcengineering/text'
import { markdownToMarkup, markupToMarkdown } from '@hcengineering/text-markdown'
import time, { ToDoPriority, type ToDo } from '@hcengineering/time'
import tracker, { IssuePriority, MilestoneStatus, type Component, type Issue, type IssueTemplate, type Milestone, type Project, type TimeSpendReport } from '@hcengineering/tracker'
import { connectClient, type HulyClient } from './client'
import { CliError } from './output'
import type { BoardCardSummary, BoardSummary, CardRoleSummary, CardSummary, CardTypeSummary, ChannelSummary, ChatMemberSummary, ChatMessageSummary, ChatSpaceSummary, ChatThreadSummary, CommentSummary, ComponentSummary, DocumentSummary, DriveResourceSummary, DriveSummary, HrDepartmentSummary, HrEmployeeSummary, HrPublicHolidaySummary, HrRequestSummary, HrRequestTypeSummary, IssueSummary, IssueTemplateSummary, LabelSummary, MemberSummary, MilestoneSummary, NotificationSummary, PersonSummary, ProjectSummary, RecruitApplicantStatusSummary, RecruitApplicantSummary, RecruitCandidateSummary, RecruitOpinionSummary, RecruitReviewSummary, RecruitVacancySummary, TeamspaceSummary, TimeReportSummary, TimeReportTotalsSummary, TimeTodoSummary } from './types'

const { getDirectChannel } = require('@hcengineering/chunter/lib/utils.js') as {
  getDirectChannel: (client: unknown, me: string, employeeAccount: string) => Promise<string>
}

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

function normalizeEmbeddedLabel(value: string | null): string | null {
  if (value === null) {
    return null
  }

  const embeddedPrefix = 'embedded:embedded:'

  if (value.startsWith(embeddedPrefix)) {
    return normalizeOptionalString(value.slice(embeddedPrefix.length))
  }

  return value
}

function toEmbeddedLabel(value: string): string {
  return `embedded:embedded:${value}`
}

function requireNonEmptyString(value: string | undefined, label: string): string {
  const normalized = normalizeOptionalString(value)

  if (normalized === null) {
    throw new CliError('VALIDATION_ERROR', `${label} cannot be empty.`, 4)
  }

  return normalized
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
  const relationRefs = Array.isArray(hydrated.relations) ? hydrated.relations : []
  const blockerRefs = Array.isArray(hydrated.blockedBy) ? hydrated.blockedBy : []
  const relatedIds = Array.from(new Set(
    [...relationRefs, ...blockerRefs]
      .map((relatedDoc) => normalizeUnknownRef(relatedDoc._id))
      .filter((relatedId): relatedId is string => relatedId !== null)
  ))
  const relatedIssues = relatedIds.length > 0
    ? await client.findAll(tracker.class.Issue, {
        _id: { $in: relatedIds as never[] }
      }, {
        limit: relatedIds.length
      })
    : []
  const relatedIdentifierById = new Map(relatedIssues.map((relatedIssue) => [relatedIssue._id as string, relatedIssue.identifier]))
  const childInfo = Array.isArray(hydrated.childInfo) ? hydrated.childInfo : []
  const relationIds = relationRefs
    .map((relatedDoc) => normalizeUnknownRef(relatedDoc._id))
    .filter((relatedId): relatedId is string => relatedId !== null)
  const blockerIds = blockerRefs
    .map((relatedDoc) => normalizeUnknownRef(relatedDoc._id))
    .filter((relatedId): relatedId is string => relatedId !== null)

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
    estimation: hydrated.estimation ?? 0,
    remainingTime: hydrated.remainingTime ?? 0,
    reportedTime: hydrated.reportedTime ?? 0,
    labels,
    parentId: parent?.parentId ?? null,
    parentIdentifier: parent?.identifier ?? null,
    blockerIds,
    blockerIdentifiers: blockerIds.map((relatedId) => relatedIdentifierById.get(relatedId) ?? relatedId),
    relationIds,
    relationIdentifiers: relationIds.map((relatedId) => relatedIdentifierById.get(relatedId) ?? relatedId),
    subIssueCount: Math.max(hydrated.subIssues ?? 0, childInfo.length),
    childEstimation: childInfo.reduce((total, child) => total + (child.estimation ?? 0), 0),
    childReportedTime: childInfo.reduce((total, child) => total + (child.reportedTime ?? 0), 0),
    templateId: hydrated.template?.template ?? null,
    templateChildId: hydrated.template?.childId ?? null
  }
}

async function resolveIssueRelationRefs(
  client: HulyClient,
  issue: Issue,
  identifiers: string[]
): Promise<RelatedDocument[]> {
  const uniqueIdentifiers = Array.from(new Set(identifiers))
  const relatedIssues = await Promise.all(uniqueIdentifiers.map(async (value) => await getIssueByIdentifier(client, value)))

  for (const relatedIssue of relatedIssues) {
    if (relatedIssue._id === issue._id) {
      throw new CliError('VALIDATION_ERROR', `Issue '${issue.identifier}' cannot reference itself.`, 4)
    }
  }

  return relatedIssues.map((relatedIssue) => ({
    _id: relatedIssue._id,
    _class: relatedIssue._class
  }))
}

async function updateIssueRelatedDocuments(
  client: HulyClient,
  identifier: string,
  field: 'relations' | 'blockedBy',
  relatedIdentifiers: string[],
  mode: 'add' | 'remove'
): Promise<IssueSummary> {
  const issue = await getIssueByIdentifier(client, identifier)
  const nextRefs = await resolveIssueRelationRefs(client, issue, relatedIdentifiers)
  const currentRefs = Array.isArray(issue[field]) ? issue[field] : []
  const currentById = new Map(
    currentRefs.map((relatedDoc) => [relatedDoc._id as string, {
      _id: relatedDoc._id,
      _class: relatedDoc._class
    }])
  )

  if (mode === 'add') {
    for (const relatedDoc of nextRefs) {
      currentById.set(relatedDoc._id as string, relatedDoc)
    }
  } else {
    const removedIds = new Set(nextRefs.map((relatedDoc) => relatedDoc._id as string))

    for (const relatedId of removedIds) {
      currentById.delete(relatedId)
    }
  }

  await client.updateDoc(tracker.class.Issue, issue.space as Ref<Project>, issue._id, {
    [field]: [...currentById.values()]
  } as never)

  return await getIssueSummary(client, identifier)
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

async function mapIssueTemplates(client: HulyClient, templates: IssueTemplate[]): Promise<IssueTemplateSummary[]> {
  const projectIds = Array.from(new Set(templates.map((template) => template.space as string)))
  const assigneeIds = Array.from(new Set(
    templates
      .flatMap((template) => [
        template.assignee,
        ...template.children.map((child) => child.assignee)
      ])
      .map((value) => normalizeUnknownRef(value))
      .filter((value) => value !== null) as string[]
  ))
  const componentIds = Array.from(new Set(
    templates
      .flatMap((template) => [
        template.component,
        ...template.children.map((child) => child.component)
      ])
      .map((value) => normalizeUnknownRef(value))
      .filter((value) => value !== null) as string[]
  ))
  const milestoneIds = Array.from(new Set(
    templates
      .flatMap((template) => [
        template.milestone,
        ...template.children.map((child) => child.milestone)
      ])
      .map((value) => normalizeUnknownRef(value))
      .filter((value) => value !== null) as string[]
  ))
  const labelIds = Array.from(new Set(
    templates
      .flatMap((template) => [
        ...(template.labels ?? []),
        ...template.children.flatMap((child) => child.labels ?? [])
      ])
      .map((value) => normalizeUnknownRef(value))
      .filter((value) => value !== null) as string[]
  ))

  const [projects, assignees, components, milestones, labels] = await Promise.all([
    projectIds.length > 0
      ? client.findAll(tracker.class.Project, { _id: { $in: projectIds as never[] } }, { limit: projectIds.length })
      : Promise.resolve([]),
    assigneeIds.length > 0
      ? client.findAll(contact.class.Person, { _id: { $in: assigneeIds as never[] } }, { limit: assigneeIds.length })
      : Promise.resolve([]),
    componentIds.length > 0
      ? client.findAll(tracker.class.Component, { _id: { $in: componentIds as never[] } }, { limit: componentIds.length })
      : Promise.resolve([]),
    milestoneIds.length > 0
      ? client.findAll(tracker.class.Milestone, { _id: { $in: milestoneIds as never[] } }, { limit: milestoneIds.length })
      : Promise.resolve([]),
    labelIds.length > 0
      ? client.findAll(tags.class.TagElement, { _id: { $in: labelIds as never[] } }, { limit: labelIds.length })
      : Promise.resolve([])
  ])

  const projectById = new Map(projects.map((project) => [project._id as string, project]))
  const assigneeById = new Map(assignees.map((person) => [person._id as string, person]))
  const componentById = new Map(components.map((component) => [component._id as string, component]))
  const milestoneById = new Map(milestones.map((milestone) => [milestone._id as string, milestone]))
  const labelById = new Map(labels.map((label) => [label._id as string, label]))
  const emailByAssigneeId = await getEmailMapForPersons(client, assignees.map((person) => person._id as string))

  return templates.map((template) => ({
    id: template._id,
    title: template.title,
    description: template.description ? inlineMarkupToMarkdown(template.description) : null,
    priority: ISSUE_PRIORITY_LABELS[template.priority] ?? template.priority,
    assignee: template.assignee ? assigneeById.get(template.assignee as string)?.name ?? null : null,
    assigneeEmail: template.assignee ? emailByAssigneeId.get(template.assignee as string) ?? null : null,
    assigneeId: template.assignee ?? null,
    component: template.component ? componentById.get(template.component as string)?.label ?? null : null,
    componentId: template.component ?? null,
    milestone: template.milestone ? milestoneById.get(template.milestone as string)?.label ?? null : null,
    milestoneId: template.milestone ?? null,
    project: projectById.get(template.space as string)?.identifier ?? null,
    estimation: template.estimation ?? 0,
    labels: (template.labels ?? []).map((labelId) => labelById.get(labelId as string)?.title ?? (labelId as string)),
    relationIds: (template.relations ?? []).map((relation) => relation._id as string),
    childCount: template.children.length,
    children: template.children.map((child) => ({
      id: child.id,
      title: child.title,
      priority: ISSUE_PRIORITY_LABELS[child.priority] ?? child.priority,
      estimation: child.estimation ?? 0,
      milestoneId: child.milestone ?? null,
      componentId: child.component ?? null,
      assigneeId: child.assignee ?? null,
      labelIds: (child.labels ?? []).map((labelId) => labelId as string)
    })),
    createdOn: timestampToIso(template.createdOn),
    modifiedOn: timestampToIso(template.modifiedOn)
  }))
}

export async function listIssues(
  client: HulyClient,
  options: {
    projectIdentifier: string
    statuses?: string[]
    assignee?: string
    priority?: string
    dateFrom?: string
    dateTo?: string
    limit?: number
    sort?: string
  }
): Promise<IssueSummary[]> {
  const project = await getProjectByIdentifier(client, options.projectIdentifier)
  const query: Record<string, unknown> = { space: project._id }

  if (options.statuses && options.statuses.length > 0) {
    const statusIds = await Promise.all(options.statuses.map(async (status) => await loadStatusForProject(client, project._id, status)))
    query.status = statusIds.length === 1 ? statusIds[0] : { $in: statusIds }
  }

  if (options.assignee) {
    query.assignee = await resolveAssigneeRef(client, options.assignee)
  }

  if (options.priority) {
    query.priority = parsePriority(options.priority)
  }

  if (options.dateFrom !== undefined || options.dateTo !== undefined) {
    const dueDateQuery: Record<string, number> = {}

    if (options.dateFrom !== undefined) {
      dueDateQuery.$gte = new Date(options.dateFrom).getTime()
    }

    if (options.dateTo !== undefined) {
      dueDateQuery.$lte = new Date(options.dateTo).getTime()
    }

    query.dueDate = dueDateQuery
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

export async function listIssueTemplates(
  client: HulyClient,
  options: {
    projectIdentifier: string
    limit?: number
  }
): Promise<IssueTemplateSummary[]> {
  const project = await getProjectByIdentifier(client, options.projectIdentifier)
  const templates = await client.findAll(tracker.class.IssueTemplate, {
    space: project._id
  }, {
    limit: options.limit ?? 100,
    sort: { modifiedOn: SortingOrder.Descending }
  })

  return await mapIssueTemplates(client, templates)
}

export async function getIssueTemplateSummary(client: HulyClient, id: string): Promise<IssueTemplateSummary> {
  const template = await client.findOne(tracker.class.IssueTemplate, { _id: id as Ref<IssueTemplate> })

  if (!template) {
    throw new CliError('NOT_FOUND', `Issue template '${id}' not found`, 3)
  }

  const [summary] = await mapIssueTemplates(client, [template])
  return summary
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
    estimation?: number
    remainingTime?: number
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
      estimation: options.estimation ?? 0,
      remainingTime: options.remainingTime ?? 0,
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
    estimation?: number
    remainingTime?: number
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

  if (updates.estimation !== undefined) {
    operations.estimation = updates.estimation
  }

  if (updates.remainingTime !== undefined) {
    operations.remainingTime = updates.remainingTime
  }

  if (Object.keys(operations).length === 0) {
    throw new CliError('VALIDATION_ERROR', 'No issue fields were provided to update.', 4)
  }

  const needsSeparateRemainingTimeUpdate =
    updates.estimation !== undefined &&
    updates.remainingTime !== undefined

  if (needsSeparateRemainingTimeUpdate) {
    const primaryOperations = { ...operations }
    delete primaryOperations.remainingTime

    if (Object.keys(primaryOperations).length > 0) {
      await client.updateDoc(tracker.class.Issue, issue.space as Ref<Project>, issue._id, primaryOperations as never)
    }

    await client.updateDoc(tracker.class.Issue, issue.space as Ref<Project>, issue._id, {
      remainingTime: updates.remainingTime
    } as never)
  } else {
    await client.updateDoc(tracker.class.Issue, issue.space as Ref<Project>, issue._id, operations as never)
  }

  return await getIssueSummary(client, identifier)
}

export async function deleteIssue(client: HulyClient, identifier: string): Promise<{ deleted: true, identifier: string }> {
  const issue = await getIssueByIdentifier(client, identifier)
  await client.removeDoc(tracker.class.Issue, issue.space as Ref<Project>, issue._id)
  return { deleted: true, identifier }
}

export async function addIssueRelations(client: HulyClient, identifier: string, relatedIdentifiers: string[]): Promise<IssueSummary> {
  return await updateIssueRelatedDocuments(client, identifier, 'relations', relatedIdentifiers, 'add')
}

export async function removeIssueRelations(client: HulyClient, identifier: string, relatedIdentifiers: string[]): Promise<IssueSummary> {
  return await updateIssueRelatedDocuments(client, identifier, 'relations', relatedIdentifiers, 'remove')
}

export async function addIssueBlockers(client: HulyClient, identifier: string, relatedIdentifiers: string[]): Promise<IssueSummary> {
  return await updateIssueRelatedDocuments(client, identifier, 'blockedBy', relatedIdentifiers, 'add')
}

export async function removeIssueBlockers(client: HulyClient, identifier: string, relatedIdentifiers: string[]): Promise<IssueSummary> {
  return await updateIssueRelatedDocuments(client, identifier, 'blockedBy', relatedIdentifiers, 'remove')
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

async function getTimeReportById(client: HulyClient, id: string): Promise<TimeSpendReport> {
  const report = await client.findOne(tracker.class.TimeSpendReport, { _id: id as Ref<TimeSpendReport> })

  if (!report) {
    throw new CliError('NOT_FOUND', `Time report '${id}' not found`, 3)
  }

  return report
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

async function mapTimeReports(client: HulyClient, reports: TimeSpendReport[]): Promise<TimeReportSummary[]> {
  const issueIds = Array.from(new Set(reports.map((report) => report.attachedTo as string)))
  const employeeIds = Array.from(new Set(
    reports
      .map((report) => report.employee)
      .filter((employeeId) => typeof employeeId === 'string')
      .map((employeeId) => employeeId as string)
  ))

  const [issues, employees] = await Promise.all([
    issueIds.length > 0
      ? client.findAll(tracker.class.Issue, { _id: { $in: issueIds as never[] } }, { limit: issueIds.length })
      : Promise.resolve([]),
    employeeIds.length > 0
      ? client.findAll(contact.mixin.Employee, { _id: { $in: employeeIds as never[] } }, { limit: employeeIds.length })
      : Promise.resolve([])
  ])

  const issueIdentifierById = new Map(issues.map((issue) => [issue._id as string, issue.identifier]))
  const employeeById = new Map(employees.map((employee) => [employee._id as string, employee]))
  const emailByEmployeeId = await getEmailMapForPersons(client, employees.map((employee) => employee._id as string))

  return reports.map((report) => {
    const employeeId = typeof report.employee === 'string' ? report.employee : null
    const employee = employeeId ? employeeById.get(employeeId) : undefined

    return {
      id: report._id,
      class: report._class,
      issue: issueIdentifierById.get(report.attachedTo as string) ?? null,
      issueId: report.attachedTo,
      employee: employee?.name ?? null,
      employeeEmail: employee ? emailByEmployeeId.get(employee._id as string) ?? null : null,
      employeeId,
      date: timestampToIso(report.date),
      value: report.value,
      description: report.description,
      createdOn: timestampToIso(report.createdOn),
      modifiedOn: timestampToIso(report.modifiedOn)
    }
  })
}

async function buildTimeReportQuery(
  client: HulyClient,
  options: {
    issueIdentifier?: string
    assignee?: string
    dateFrom?: string
    dateTo?: string
  }
): Promise<Record<string, unknown>> {
  const query: Record<string, unknown> = {
    attachedToClass: tracker.class.Issue,
    collection: 'reports'
  }

  if (options.issueIdentifier !== undefined) {
    const issue = await getIssueByIdentifier(client, options.issueIdentifier)
    query.attachedTo = issue._id
  }

  if (options.assignee !== undefined) {
    query.employee = await resolveEmployeeRef(client, options.assignee)
  }

  const dateFilters: Record<string, number> = {}

  if (options.dateFrom !== undefined) {
    dateFilters.$gte = new Date(options.dateFrom).getTime()
  }

  if (options.dateTo !== undefined) {
    dateFilters.$lte = new Date(options.dateTo).getTime()
  }

  if (Object.keys(dateFilters).length > 0) {
    query.date = dateFilters
  }

  return query
}

async function findTimeReports(
  client: HulyClient,
  options: {
    issueIdentifier?: string
    assignee?: string
    dateFrom?: string
    dateTo?: string
    limit?: number
  }
): Promise<TimeSpendReport[]> {
  const query = await buildTimeReportQuery(client, options)

  return await client.findAll(tracker.class.TimeSpendReport, query as never, {
    ...(options.limit === undefined ? {} : { limit: options.limit }),
    sort: {
      date: SortingOrder.Descending,
      modifiedOn: SortingOrder.Descending
    }
  })
}

export async function listTimeReports(
  client: HulyClient,
  options: {
    issueIdentifier?: string
    assignee?: string
    dateFrom?: string
    dateTo?: string
    limit?: number
  }
): Promise<TimeReportSummary[]> {
  const reports = await findTimeReports(client, {
    ...options,
    limit: options.limit ?? 20
  })

  return await mapTimeReports(client, reports)
}

export async function getTimeReportTotals(
  client: HulyClient,
  options: {
    issueIdentifier?: string
    assignee?: string
    dateFrom?: string
    dateTo?: string
  }
): Promise<TimeReportTotalsSummary> {
  const reports = await mapTimeReports(client, await findTimeReports(client, options))
  const byIssue = new Map<string, { issue: string | null, issueId: string | null, reportCount: number, totalValue: number }>()
  const byEmployee = new Map<string, { employee: string | null, employeeEmail: string | null, employeeId: string | null, reportCount: number, totalValue: number }>()

  for (const report of reports) {
    const issueKey = report.issueId ?? '__none__'
    const issueEntry = byIssue.get(issueKey) ?? {
      issue: report.issue,
      issueId: report.issueId,
      reportCount: 0,
      totalValue: 0
    }
    issueEntry.reportCount += 1
    issueEntry.totalValue += report.value
    byIssue.set(issueKey, issueEntry)

    const employeeKey = report.employeeId ?? '__none__'
    const employeeEntry = byEmployee.get(employeeKey) ?? {
      employee: report.employee,
      employeeEmail: report.employeeEmail,
      employeeId: report.employeeId,
      reportCount: 0,
      totalValue: 0
    }
    employeeEntry.reportCount += 1
    employeeEntry.totalValue += report.value
    byEmployee.set(employeeKey, employeeEntry)
  }

  return {
    reportCount: reports.length,
    totalValue: reports.reduce((total, report) => total + report.value, 0),
    filters: {
      issue: options.issueIdentifier ?? null,
      assignee: options.assignee ?? null,
      dateFrom: options.dateFrom ?? null,
      dateTo: options.dateTo ?? null
    },
    byIssue: [...byIssue.values()].sort((left, right) => right.totalValue - left.totalValue || right.reportCount - left.reportCount),
    byEmployee: [...byEmployee.values()].sort((left, right) => right.totalValue - left.totalValue || right.reportCount - left.reportCount)
  }
}

export async function getTimeReportSummary(client: HulyClient, id: string): Promise<TimeReportSummary> {
  const [report] = await mapTimeReports(client, [await getTimeReportById(client, id)])
  return report
}

export async function createTimeReport(
  client: HulyClient,
  options: {
    issueIdentifier: string
    value: number
    description: string
    assignee?: string
    date?: string
  }
): Promise<TimeReportSummary> {
  const issue = await getIssueByIdentifier(client, options.issueIdentifier)
  const employee = (await resolveEmployeeRef(client, options.assignee)) ?? await getCurrentEmployeeRef(client)
  const reportId = await client.addCollection(
    tracker.class.TimeSpendReport,
    issue.space as Ref<Space>,
    issue._id,
    tracker.class.Issue,
    'reports',
    {
      employee,
      date: options.date ? new Date(options.date).getTime() : Date.now(),
      value: options.value,
      description: options.description
    } as never
  )

  return await getTimeReportSummary(client, reportId)
}

export async function updateTimeReport(
  client: HulyClient,
  id: string,
  updates: {
    value?: number
    description?: string
    assignee?: string
    date?: string
  }
): Promise<TimeReportSummary> {
  const report = await getTimeReportById(client, id)
  const operations: Record<string, unknown> = {}

  if (updates.value !== undefined) {
    operations.value = updates.value
  }

  if (updates.description !== undefined) {
    operations.description = updates.description
  }

  if (updates.assignee !== undefined) {
    operations.employee = await resolveEmployeeRef(client, updates.assignee)
  }

  if (updates.date !== undefined) {
    operations.date = new Date(updates.date).getTime()
  }

  if (Object.keys(operations).length === 0) {
    throw new CliError('VALIDATION_ERROR', 'No time report fields were provided to update.', 4)
  }

  await client.updateDoc(report._class as Ref<Class<TimeSpendReport>>, report.space, report._id, operations as never)
  return await getTimeReportSummary(client, id)
}

export async function deleteTimeReport(client: HulyClient, id: string): Promise<{ deleted: true, id: string }> {
  const report = await getTimeReportById(client, id)
  await client.removeDoc(report._class as Ref<Class<TimeSpendReport>>, report.space, report._id)
  return { deleted: true, id }
}

function getFallbackCardTypeLabel(typeId: string): string {
  const segments = typeId.split(':')
  return segments[segments.length - 1] || typeId
}

function isBuiltinCardTypeId(typeId: string): boolean {
  return typeId.startsWith('card:') || typeId.startsWith('contact:') || typeId.startsWith('communication:') || typeId.startsWith('chat:')
}

function getCardTypeExtendsId(typeDoc?: Partial<MasterTag>): string | null {
  return normalizeUnknownRef((typeDoc as { extends?: unknown } | undefined)?.extends)
}

function getCardTypeLabel(typeId: string, typeDoc?: Partial<MasterTag>): string {
  return CARD_TYPE_LABELS.get(typeId)
    ?? normalizeEmbeddedLabel(normalizeUnknownString((typeDoc as { title?: unknown } | undefined)?.title))
    ?? normalizeEmbeddedLabel(normalizeUnknownString((typeDoc as { name?: unknown } | undefined)?.name))
    ?? normalizeEmbeddedLabel(normalizeUnknownString((typeDoc as { label?: unknown } | undefined)?.label))
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

async function listAvailableCardTypeIds(client: HulyClient): Promise<string[]> {
  const defaultSpace = await getDefaultCardSpace(client)
  return Array.from(new Set([card.class.Card as string, ...(defaultSpace.types ?? []).map((typeId) => typeId as string)]))
}

async function mapCardTypeSummaries(
  client: HulyClient,
  typeIds: string[],
  options?: {
    inDefaultSpaceIds?: string[]
  }
): Promise<CardTypeSummary[]> {
  const uniqueTypeIds = Array.from(new Set(typeIds))
  const inDefaultSpaceIds = new Set(options?.inDefaultSpaceIds ?? uniqueTypeIds)
  const typeById = await getCardTypesById(client, uniqueTypeIds)
  const extendsIds = Array.from(new Set(
    uniqueTypeIds
      .map((typeId) => getCardTypeExtendsId(typeById.get(typeId)))
      .filter((typeId): typeId is string => typeId !== null)
  ))
  const extendsById = await getCardTypesById(client, extendsIds)

  return uniqueTypeIds.map((typeId) => {
    const typeDoc = typeById.get(typeId)
    const extendsId = getCardTypeExtendsId(typeDoc)

    return {
      id: typeId,
      label: getCardTypeLabel(typeId, typeDoc),
      builtin: isBuiltinCardTypeId(typeId),
      inDefaultSpace: inDefaultSpaceIds.has(typeId),
      extendsId,
      extendsLabel: extendsId ? getCardTypeLabel(extendsId, extendsById.get(extendsId)) : null,
      color: typeof typeDoc?.color === 'number' ? typeDoc.color : null,
      background: typeof typeDoc?.background === 'number' ? typeDoc.background : null,
      removed: typeof typeDoc?.removed === 'boolean' ? typeDoc.removed : null,
      createdOn: timestampToIso(typeDoc?.createdOn),
      modifiedOn: timestampToIso(typeDoc?.modifiedOn)
    }
  })
}

async function getCardTypeDocById(client: HulyClient, id: string): Promise<MasterTag> {
  const typeDoc = await client.findOne(card.class.MasterTag, { _id: id as Ref<MasterTag> })

  if (!typeDoc) {
    throw new CliError('NOT_FOUND', `Card type '${id}' not found`, 3)
  }

  return typeDoc
}

async function getMutableCardTypeDocById(client: HulyClient, id: string): Promise<MasterTag> {
  if (isBuiltinCardTypeId(id)) {
    throw new CliError('VALIDATION_ERROR', `Card type '${id}' is built in and cannot be modified.`, 4)
  }

  return await getCardTypeDocById(client, id)
}

async function ensureUniqueCardTypeLabel(client: HulyClient, label: string, currentTypeId?: string): Promise<void> {
  const existingTypes = await listCardTypes(client)
  const normalized = normalizeString(label)
  const duplicate = existingTypes.find((type) => type.id !== currentTypeId && normalizeString(type.label) === normalized)

  if (duplicate) {
    throw new CliError('VALIDATION_ERROR', `Card type label '${label}' already exists`, 4)
  }
}

async function getCardRoleById(client: HulyClient, id: string): Promise<CardRole> {
  const role = await client.findOne(card.class.Role, { _id: id as Ref<CardRole> })

  if (!role) {
    throw new CliError('NOT_FOUND', `Card role '${id}' not found`, 3)
  }

  return role
}

async function mapCardRoleSummaries(client: HulyClient, roles: CardRole[]): Promise<CardRoleSummary[]> {
  const typeIds = Array.from(new Set(roles.map((role) => role.attachedTo as string)))
  const typeById = await getCardTypesById(client, typeIds)

  return roles.map((role) => ({
    id: role._id,
    name: role.name,
    typeId: role.attachedTo,
    typeLabel: getCardTypeLabel(role.attachedTo, typeById.get(role.attachedTo as string)),
    createdOn: timestampToIso(role.createdOn),
    modifiedOn: timestampToIso(role.modifiedOn)
  }))
}

async function ensureUniqueCardRoleName(
  client: HulyClient,
  typeId: string,
  name: string,
  currentRoleId?: string
): Promise<void> {
  const roles = await client.findAll(card.class.Role, {
    attachedTo: typeId as never
  }, {
    limit: 200
  })
  const normalized = normalizeString(name)
  const duplicate = roles.find((role) => role._id !== currentRoleId && normalizeString(role.name) === normalized)

  if (duplicate) {
    throw new CliError('VALIDATION_ERROR', `Card role '${name}' already exists on type '${typeId}'`, 4)
  }
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
    readonly: typeof cardDoc.readonly === 'boolean' ? cardDoc.readonly : null,
    rank: cardDoc.rank ?? null,
    createdOn: timestampToIso(cardDoc.createdOn),
    modifiedOn: timestampToIso(cardDoc.modifiedOn)
  })))
}

export async function listCardTypes(client: HulyClient): Promise<CardTypeSummary[]> {
  const typeIds = await listAvailableCardTypeIds(client)
  return await mapCardTypeSummaries(client, typeIds, { inDefaultSpaceIds: typeIds })
}

export async function getCardTypeSummary(client: HulyClient, id: string): Promise<CardTypeSummary> {
  if (id !== card.class.Card) {
    await getCardTypeDocById(client, id)
  }

  const inDefaultSpaceIds = await listAvailableCardTypeIds(client)
  const [summary] = await mapCardTypeSummaries(client, [id], { inDefaultSpaceIds })
  return summary
}

export async function createCardType(
  client: HulyClient,
  options: {
    label: string
    extends?: string
    color?: number
    background?: number
    removed?: boolean
  }
): Promise<CardTypeSummary> {
  const label = requireNonEmptyString(options.label, 'Card type label')
  await ensureUniqueCardTypeLabel(client, label)

  const extendsId = await resolveCardType(client, options.extends)
  const typeId = await client.createDoc(card.class.MasterTag, core.space.Model, {
    label: toEmbeddedLabel(label),
    icon: card.icon.MasterTag,
    kind: 0,
    extends: extendsId,
    ...(options.color === undefined ? {} : { color: options.color }),
    ...(options.background === undefined ? {} : { background: options.background }),
    ...(options.removed === undefined ? {} : { removed: options.removed })
  } as never)

  try {
    await client.updateDoc(card.class.CardSpace, core.space.Space, card.space.Default, {
      $push: {
        types: typeId
      }
    } as never)
  } catch (error) {
    await client.removeDoc(card.class.MasterTag, core.space.Model, typeId as Ref<MasterTag>)
    throw error
  }

  return await getCardTypeSummary(client, typeId)
}

export async function updateCardType(
  client: HulyClient,
  id: string,
  updates: {
    label?: string
    extends?: string
    color?: number
    background?: number
    removed?: boolean
  }
): Promise<CardTypeSummary> {
  const typeDoc = await getMutableCardTypeDocById(client, id)
  const operations: Record<string, unknown> = {}

  if (updates.label !== undefined) {
    const label = requireNonEmptyString(updates.label, 'Card type label')
    await ensureUniqueCardTypeLabel(client, label, typeDoc._id)
    operations.label = toEmbeddedLabel(label)
  }

  if (updates.extends !== undefined) {
    const extendsId = await resolveCardType(client, updates.extends)

    if (extendsId === typeDoc._id) {
      throw new CliError('VALIDATION_ERROR', 'Card type cannot extend itself.', 4)
    }

    operations.extends = extendsId
  }

  if (updates.color !== undefined) {
    operations.color = updates.color
  }

  if (updates.background !== undefined) {
    operations.background = updates.background
  }

  if (updates.removed !== undefined) {
    operations.removed = updates.removed
  }

  if (Object.keys(operations).length === 0) {
    throw new CliError('VALIDATION_ERROR', 'No card type fields were provided to update.', 4)
  }

  await client.updateDoc(card.class.MasterTag, core.space.Model, typeDoc._id, operations as never)
  return await getCardTypeSummary(client, typeDoc._id)
}

export async function deleteCardType(client: HulyClient, id: string): Promise<{ deleted: true, id: string }> {
  const typeDoc = await getMutableCardTypeDocById(client, id)
  const cardsWithType = await client.findAll(card.class.Card, {
    _class: typeDoc._id as never
  }, {
    limit: 1
  })

  if (cardsWithType.length > 0) {
    throw new CliError('VALIDATION_ERROR', `Card type '${id}' is still used by existing cards and cannot be deleted.`, 4)
  }

  const roles = await client.findAll(card.class.Role, {
    attachedTo: typeDoc._id as never
  }, {
    limit: 200
  })

  for (const role of roles) {
    await client.removeDoc(card.class.Role, core.space.Model, role._id)
  }

  await client.updateDoc(card.class.CardSpace, core.space.Space, card.space.Default, {
    $pull: {
      types: typeDoc._id
    }
  } as never)
  await client.removeDoc(card.class.MasterTag, core.space.Model, typeDoc._id)

  return { deleted: true, id: typeDoc._id }
}

export async function listCardRoles(
  client: HulyClient,
  options: {
    typeId: string
  }
): Promise<CardRoleSummary[]> {
  const typeDoc = await getMutableCardTypeDocById(client, options.typeId)
  const roles = await client.findAll(card.class.Role, {
    attachedTo: typeDoc._id as never
  }, {
    limit: 200,
    sort: { name: SortingOrder.Ascending }
  })

  return await mapCardRoleSummaries(client, roles)
}

export async function getCardRoleSummary(client: HulyClient, id: string): Promise<CardRoleSummary> {
  const [summary] = await mapCardRoleSummaries(client, [await getCardRoleById(client, id)])
  return summary
}

export async function createCardRole(
  client: HulyClient,
  options: {
    typeId: string
    name: string
  }
): Promise<CardRoleSummary> {
  const typeDoc = await getMutableCardTypeDocById(client, options.typeId)
  const name = requireNonEmptyString(options.name, 'Card role name')
  await ensureUniqueCardRoleName(client, typeDoc._id, name)

  const roleId = await client.addCollection(
    card.class.Role,
    core.space.Model,
    typeDoc._id,
    card.class.MasterTag,
    'roles',
    {
      name
    } as never
  )

  return await getCardRoleSummary(client, roleId)
}

export async function updateCardRole(
  client: HulyClient,
  id: string,
  updates: {
    name?: string
  }
): Promise<CardRoleSummary> {
  const role = await getCardRoleById(client, id)
  await getMutableCardTypeDocById(client, role.attachedTo)

  if (updates.name === undefined) {
    throw new CliError('VALIDATION_ERROR', 'No card role fields were provided to update.', 4)
  }

  const name = requireNonEmptyString(updates.name, 'Card role name')
  await ensureUniqueCardRoleName(client, role.attachedTo, name, role._id)
  await client.updateDoc(card.class.Role, core.space.Model, role._id, { name } as never)

  return await getCardRoleSummary(client, role._id)
}

export async function deleteCardRole(client: HulyClient, id: string): Promise<{ deleted: true, id: string }> {
  const role = await getCardRoleById(client, id)
  await getMutableCardTypeDocById(client, role.attachedTo)
  await client.removeDoc(card.class.Role, core.space.Model, role._id)
  return { deleted: true, id: role._id }
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
    readonly?: boolean
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
      rank: makeRank(lastCard?.rank, undefined),
      ...(options.readonly === undefined ? {} : { readonly: options.readonly })
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
    readonly?: boolean
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

  if (updates.readonly !== undefined) {
    operations.readonly = updates.readonly
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

async function getChatChannelById(client: HulyClient, id: string): Promise<HulyChatChannel> {
  const channel = await client.findOne(chunter.class.Channel, { _id: id as Ref<HulyChatChannel> })

  if (!channel) {
    throw new CliError('NOT_FOUND', `Channel '${id}' not found`, 3)
  }

  return channel
}

async function findDirectChatByMembers(client: HulyClient, members: string[]): Promise<HulyDirectMessage | null> {
  const normalizedMembers = [...members].sort()
  const directMessages = await client.findAll(chunter.class.DirectMessage, {}, {
    sort: { modifiedOn: SortingOrder.Descending }
  })

  for (const directMessage of directMessages) {
    const directMembers = Array.isArray(directMessage.members) ? [...directMessage.members].sort() : []

    if (directMembers.length === normalizedMembers.length && directMembers.every((member, index) => member === normalizedMembers[index])) {
      return directMessage
    }
  }

  return null
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

async function resolveExplicitChatMemberAccountUuids(client: HulyClient, emails: string[]): Promise<string[]> {
  return Array.from(new Set(await Promise.all(emails.map(async (email) => await resolveChatMemberAccountUuid(client, email)))))
}

async function mapChatMemberSummaries(client: HulyClient, accountUuids: string[]): Promise<ChatMemberSummary[]> {
  const employees = accountUuids.length > 0
    ? await client.findAll(contact.mixin.Employee, {
        personUuid: { $in: accountUuids as never[] }
      }, {
        limit: accountUuids.length
      })
    : []
  const employeeByAccountUuid = new Map(
    employees
      .filter((employee) => employee.personUuid)
      .map((employee) => [employee.personUuid as string, employee])
  )
  const emailByEmployeeId = await getEmailMapForPersons(client, employees.map((employee) => employee._id as string))

  return accountUuids.map((accountUuid) => {
    const employee = employeeByAccountUuid.get(accountUuid)

    return {
      accountUuid,
      memberId: employee?._id ?? null,
      name: employee?.name ?? null,
      email: employee ? emailByEmployeeId.get(employee._id as string) ?? null : null
    }
  })
}

async function updateChatChannelMembers(
  client: HulyClient,
  id: string,
  transform: (members: string[], explicitMembers: string[]) => string[],
  memberEmails: string[]
): Promise<ChatMemberSummary[]> {
  const channel = await getChatChannelById(client, id)
  const explicitMembers = await resolveExplicitChatMemberAccountUuids(client, memberEmails)
  const currentMembers = Array.isArray(channel.members) ? [...channel.members] : []
  const nextMembers = transform(currentMembers, explicitMembers)

  if (nextMembers.length === 0) {
    throw new CliError('VALIDATION_ERROR', 'A chat channel must retain at least one member.', 4)
  }

  await client.updateDoc(chunter.class.Channel, channel.space, channel._id, {
    members: nextMembers
  } as never)

  return await mapChatMemberSummaries(client, nextMembers)
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

async function mapThreadMessageSummary(
  client: HulyClient,
  message: HulyThreadMessage,
  authorNames: Map<string, string>,
  chatSpace?: ChatSpaceDoc
): Promise<ChatThreadSummary> {
  const resolvedChatSpace = chatSpace ?? await getChatSpaceById(client, message.objectId)

  return {
    id: message._id,
    parentMessageId: message.attachedTo,
    chatId: message.objectId,
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

async function getThreadMessageById(client: HulyClient, id: string): Promise<HulyThreadMessage> {
  const message = await client.findOne(chunter.class.ThreadMessage, { _id: id as Ref<HulyThreadMessage> })

  if (!message) {
    throw new CliError('NOT_FOUND', `Thread message '${id}' not found`, 3)
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

async function waitForThreadMessageSummary(id: string, expectedMessage: string): Promise<ChatThreadSummary> {
  const { client } = await connectClient()

  try {
    let lastSummary: ChatThreadSummary | undefined

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const message = await getThreadMessageById(client, id)
      const authorNames = await getAuthorNameMap(client, [message.modifiedBy])
      lastSummary = await mapThreadMessageSummary(client, message, authorNames)

      if (lastSummary.message === expectedMessage) {
        return lastSummary
      }

      await sleep(2000)
    }

    return {
      ...(lastSummary ?? await (async () => {
        const message = await getThreadMessageById(client, id)
        const authorNames = await getAuthorNameMap(client, [message.modifiedBy])
        return await mapThreadMessageSummary(client, message, authorNames)
      })()),
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

export async function getDirectChatSummary(client: HulyClient, memberEmail: string): Promise<ChatSpaceSummary> {
  const account = await client.getAccount()
  const memberAccountUuid = await resolveChatMemberAccountUuid(client, memberEmail)
  const members = Array.from(new Set([account.uuid, memberAccountUuid])).sort()
  const directMessage = await findDirectChatByMembers(client, members)

  if (!directMessage) {
    throw new CliError('NOT_FOUND', `Direct chat with '${memberEmail}' not found`, 3)
  }

  return mapChatSpaceSummary(directMessage)
}

export async function createDirectChat(client: HulyClient, memberEmail: string): Promise<ChatSpaceSummary> {
  const account = await client.getAccount()
  const memberAccountUuid = await resolveChatMemberAccountUuid(client, memberEmail)
  const directChatId = await getDirectChannel(client as never, account.uuid as never, memberAccountUuid as never)
  return await getChatSpaceSummary(client, directChatId)
}

export async function listChatMembers(client: HulyClient, id: string): Promise<ChatMemberSummary[]> {
  const channel = await getChatChannelById(client, id)
  return await mapChatMemberSummaries(client, Array.isArray(channel.members) ? [...channel.members] : [])
}

export async function addChatMembers(client: HulyClient, id: string, memberEmails: string[]): Promise<ChatMemberSummary[]> {
  return await updateChatChannelMembers(client, id, (members, explicitMembers) => {
    const nextMembers = [...members]

    for (const member of explicitMembers) {
      if (!nextMembers.includes(member)) {
        nextMembers.push(member)
      }
    }

    return nextMembers
  }, memberEmails)
}

export async function removeChatMembers(client: HulyClient, id: string, memberEmails: string[]): Promise<ChatMemberSummary[]> {
  return await updateChatChannelMembers(client, id, (members, explicitMembers) => {
    const removed = new Set(explicitMembers)
    return members.filter((member) => !removed.has(member))
  }, memberEmails)
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
  const channel = await getChatChannelById(client, id)

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
  const channel = await getChatChannelById(client, id)
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

export async function listThreadMessages(
  client: HulyClient,
  options: {
    parentMessageId: string
    limit?: number
  }
): Promise<ChatThreadSummary[]> {
  const parentMessage = await getChatMessageById(client, options.parentMessageId)
  const chatSpace = await getChatSpaceById(client, parentMessage.attachedTo)
  const messages = await client.findAll(chunter.class.ThreadMessage, {
    attachedTo: parentMessage._id as never,
    attachedToClass: chunter.class.ChatMessage as never,
    collection: 'messages' as never
  }, {
    limit: options.limit ?? 20,
    sort: { createdOn: SortingOrder.Ascending }
  })
  const authorNames = await getAuthorNameMap(client, messages.map((message) => message.modifiedBy))

  return await Promise.all(messages.map(async (message) => await mapThreadMessageSummary(client, message, authorNames, chatSpace)))
}

export async function getThreadMessageSummary(client: HulyClient, id: string): Promise<ChatThreadSummary> {
  const message = await getThreadMessageById(client, id)
  const authorNames = await getAuthorNameMap(client, [message.modifiedBy])
  return await mapThreadMessageSummary(client, message, authorNames)
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

export async function createThreadMessage(
  client: HulyClient,
  options: {
    parentMessageId: string
    message: string
  }
): Promise<ChatThreadSummary> {
  const parentMessage = await getChatMessageById(client, options.parentMessageId)
  const id = await client.addCollection(
    chunter.class.ThreadMessage,
    core.space.Space,
    parentMessage._id,
    chunter.class.ChatMessage,
    'messages',
    {
      objectId: parentMessage.attachedTo,
      objectClass: parentMessage.attachedToClass,
      message: markdown(options.message)
    } as never
  )

  return await getThreadMessageSummary(client, id)
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

export async function updateThreadMessage(
  client: HulyClient,
  id: string,
  updates: {
    message?: string
  }
): Promise<ChatThreadSummary> {
  const message = await getThreadMessageById(client, id)

  if (updates.message === undefined) {
    throw new CliError('VALIDATION_ERROR', 'No thread message fields were provided to update.', 4)
  }

  await client.updateDoc(chunter.class.ThreadMessage, message.space, message._id, {
    message: markdown(updates.message)
  } as never)

  const summary = await waitForThreadMessageSummary(id, updates.message)

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

export async function deleteThreadMessage(client: HulyClient, id: string): Promise<{ deleted: true, id: string }> {
  const message = await getThreadMessageById(client, id)
  await client.removeDoc(chunter.class.ThreadMessage, message.space, message._id)
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

const DRIVE_CLASS = 'drive:class:Drive'
const DRIVE_TYPE = 'drive:spaceType:DefaultDrive'
const DRIVE_FOLDER_CLASS = 'drive:class:Folder'
const DRIVE_FILE_CLASS = 'drive:class:File'
const RECRUIT_VACANCY_CLASS = 'recruit:class:Vacancy'
const RECRUIT_VACANCY_TYPE = 'recruit:template:DefaultVacancy'
const RECRUIT_APPLICANT_CLASS = 'recruit:class:Applicant'
const RECRUIT_APPLICANT_TASK_TYPE = 'recruit:taskTypes:Applicant'
const RECRUIT_CANDIDATE_MIXIN = 'recruit:mixin:Candidate'
const RECRUIT_REVIEW_CLASS = 'recruit:class:Review'
const RECRUIT_OPINION_CLASS = 'recruit:class:Opinion'
const RECRUIT_REVIEW_COLLECTION = 'reviews'
const RECRUIT_OPINION_COLLECTION = 'opinions'
const DEFAULT_CALENDAR = 'calendar:default'
const HR_REQUEST_COLLECTION = 'requests'
const RECRUIT_APPLICANT_COLLECTION = 'applicants'

function pluginLabelToText(value: string | null): string | null {
  if (value === null) {
    return null
  }

  const index = value.lastIndexOf(':')
  return index === -1 ? value : value.slice(index + 1)
}

function tzDateToIso(value: unknown): string | null {
  if (value === null || value === undefined || typeof value !== 'object') {
    return null
  }

  try {
    return new Date(fromTzDate(value as any)).toISOString()
  } catch {
    return null
  }
}

function isoToTzDate(value: string): unknown {
  return toTzDate(new Date(value))
}

async function findPersonNames(client: HulyClient, ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const resolvedIds = Array.from(new Set(ids.filter((value): value is string => typeof value === 'string' && value.length > 0)))

  if (resolvedIds.length === 0) {
    return new Map()
  }

  const persons = await client.findAll(contact.class.Person, { _id: { $in: resolvedIds as never[] } }, { limit: resolvedIds.length })
  return new Map(persons.map((person) => [person._id as string, person.name]))
}

async function findDepartmentNames(client: HulyClient, ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const resolvedIds = Array.from(new Set(ids.filter((value): value is string => typeof value === 'string' && value.length > 0)))

  if (resolvedIds.length === 0) {
    return new Map()
  }

  const departments = await client.findAll(hr.class.Department, { _id: { $in: resolvedIds as never[] } }, { limit: resolvedIds.length })
  return new Map(departments.map((department) => [department._id as string, department.name]))
}

async function getBoardById(client: HulyClient, id: string): Promise<any> {
  const entry = await client.findOne(board.class.Board as any, { _id: id as never })

  if (!entry) {
    throw new CliError('NOT_FOUND', `Board '${id}' not found`, 3)
  }

  return entry
}

async function getBoardCardById(client: HulyClient, id: string): Promise<any> {
  const entry = await client.findOne(board.class.Card as any, { _id: id as never })

  if (!entry) {
    throw new CliError('NOT_FOUND', `Board card '${id}' not found`, 3)
  }

  return entry
}

function mapBoardSummary(entry: any): BoardSummary {
  return {
    id: entry._id,
    name: entry.name,
    description: normalizeUnknownString(entry.description),
    private: Boolean(entry.private),
    archived: Boolean(entry.archived),
    type: normalizeUnknownString(entry.type),
    createdOn: timestampToIso(entry.createdOn),
    modifiedOn: timestampToIso(entry.modifiedOn)
  }
}

export async function listBoards(client: HulyClient): Promise<BoardSummary[]> {
  const entries = await client.findAll(board.class.Board as any, {}, {
    limit: 100,
    sort: { name: SortingOrder.Ascending }
  })

  return entries.map((entry) => mapBoardSummary(entry))
}

export async function getBoardSummary(client: HulyClient, id: string): Promise<BoardSummary> {
  return mapBoardSummary(await getBoardById(client, id))
}

export async function createBoard(
  client: HulyClient,
  options: {
    name: string
    description?: string
    private?: boolean
  }
): Promise<BoardSummary> {
  const id = await client.createDoc(board.class.Board as any, core.space.Space, {
    name: options.name,
    description: options.description ?? '',
    type: 'board:template:DefaultBoard',
    private: options.private ?? false,
    archived: false,
    members: []
  } as never)

  return await getBoardSummary(client, id)
}

export async function updateBoard(
  client: HulyClient,
  id: string,
  updates: {
    name?: string
    description?: string
    private?: boolean
    archived?: boolean
  }
): Promise<BoardSummary> {
  const entry = await getBoardById(client, id)
  const operations: Record<string, unknown> = {}

  if (updates.name !== undefined) {
    operations.name = updates.name
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
    throw new CliError('VALIDATION_ERROR', 'No board fields were provided to update.', 4)
  }

  await client.updateDoc(board.class.Board as any, core.space.Space, entry._id, operations as never)
  return await getBoardSummary(client, id)
}

export async function deleteBoard(client: HulyClient, id: string): Promise<{ deleted: true, id: string }> {
  const entry = await getBoardById(client, id)
  await client.removeDoc(board.class.Board as any, core.space.Space, entry._id)
  return { deleted: true, id }
}

async function mapBoardCardSummaries(
  client: HulyClient,
  cards: any[],
  options: {
    includeDescription: boolean
  }
): Promise<BoardCardSummary[]> {
  const boardIds = Array.from(new Set(
    cards
      .map((cardDoc) => normalizeUnknownRef(cardDoc.attachedTo))
      .filter((value): value is string => value !== null)
  ))
  const assigneeIds = cards.map((cardDoc) => normalizeUnknownRef(cardDoc.assignee))
  const [boards, assigneeNames] = await Promise.all([
    boardIds.length > 0
      ? client.findAll(board.class.Board as any, { _id: { $in: boardIds as never[] } }, { limit: boardIds.length })
      : Promise.resolve([]),
    findPersonNames(client, assigneeIds)
  ])
  const boardNameById = new Map<string, string>(boards.map((entry) => [entry._id as string, (entry as any).name as string]))

  for (const boardId of boardIds) {
    if (!boardNameById.has(boardId)) {
      try {
        boardNameById.set(boardId, (await getBoardById(client, boardId)).name as string)
      } catch {}
    }
  }

  return await Promise.all(cards.map(async (cardDoc) => {
    const boardId = normalizeUnknownRef(cardDoc.attachedTo) ?? ''

    return {
      id: cardDoc._id,
      boardId,
      boardName: boardNameById.get(boardId) ?? null,
      title: cardDoc.title,
      description: options.includeDescription && cardDoc.description
        ? await client.fetchMarkup(board.class.Card as any, cardDoc._id, 'description', cardDoc.description as never, 'markdown')
        : null,
      status: normalizeUnknownString(cardDoc.status),
      number: typeof cardDoc.number === 'number' ? cardDoc.number : null,
      assigneeId: normalizeUnknownRef(cardDoc.assignee),
      assigneeName: assigneeNames.get(cardDoc.assignee) ?? null,
      startDate: typeof cardDoc.startDate === 'number' && cardDoc.startDate > 0 ? timestampToIso(cardDoc.startDate) : null,
      dueDate: typeof cardDoc.dueDate === 'number' && cardDoc.dueDate > 0 ? timestampToIso(cardDoc.dueDate) : null,
      location: normalizeUnknownString(cardDoc.location),
      archived: Boolean(cardDoc.isArchived),
      createdOn: timestampToIso(cardDoc.createdOn),
      modifiedOn: timestampToIso(cardDoc.modifiedOn)
    }
  }))
}

export async function listBoardCards(
  client: HulyClient,
  options: {
    boardId?: string
    limit?: number
  }
): Promise<BoardCardSummary[]> {
  const query: Record<string, unknown> = {}

  if (options.boardId !== undefined) {
    query.attachedTo = (await getBoardById(client, options.boardId))._id
  }

  const cards = await client.findAll(board.class.Card as any, query as never, {
    limit: options.limit ?? 20,
    sort: { modifiedOn: SortingOrder.Descending }
  })

  return await mapBoardCardSummaries(client, cards, { includeDescription: false })
}

export async function getBoardCardSummary(client: HulyClient, id: string): Promise<BoardCardSummary> {
  const [summary] = await mapBoardCardSummaries(client, [await getBoardCardById(client, id)], { includeDescription: true })
  return summary
}

export async function createBoardCard(
  client: HulyClient,
  options: {
    boardId: string
    title: string
    description?: string
    location?: string
    startDate?: string
    dueDate?: string
    archived?: boolean
  }
): Promise<BoardCardSummary> {
  const boardDoc = await getBoardById(client, options.boardId)
  const title = requireNonEmptyString(options.title, 'Board card title')
  const [lastByNumber, lastByRank] = await Promise.all([
    client.findOne(board.class.Card as any, { attachedTo: boardDoc._id as never }, {
      sort: { number: SortingOrder.Descending }
    }) as Promise<any>,
    client.findOne(board.class.Card as any, { attachedTo: boardDoc._id as never }, {
      sort: { rank: SortingOrder.Descending }
    }) as Promise<any>
  ])

  const id = await client.addCollection(
    board.class.Card as any,
    core.space.Space,
    boardDoc._id,
    board.class.Board as any,
    'cards',
    {
      title,
      description: options.description ? markdown(options.description) : '',
      kind: board.taskType.Card as any,
      status: '',
      number: (typeof lastByNumber?.number === 'number' ? lastByNumber.number : 0) + 1,
      assignee: null,
      dueDate: options.dueDate ? Date.parse(options.dueDate) : null,
      rank: makeRank(lastByRank?.rank, undefined),
      startDate: options.startDate ? Date.parse(options.startDate) : null,
      location: options.location ?? '',
      isArchived: options.archived ?? false
    } as never
  )

  const summary = await getBoardCardSummary(client, id)
  return {
    ...summary,
    description: options.description ?? summary.description
  }
}

export async function updateBoardCard(
  client: HulyClient,
  id: string,
  updates: {
    title?: string
    description?: string
    location?: string | null
    startDate?: string | null
    dueDate?: string | null
    archived?: boolean
  }
): Promise<BoardCardSummary> {
  const cardDoc = await getBoardCardById(client, id)
  const operations: Record<string, unknown> = {}

  if (updates.title !== undefined) {
    operations.title = requireNonEmptyString(updates.title, 'Board card title')
  }

  if (updates.description !== undefined) {
    operations.description = updates.description ? markdown(updates.description) : ''
  }

  if (updates.location !== undefined) {
    operations.location = updates.location ?? ''
  }

  if (updates.startDate !== undefined) {
    operations.startDate = updates.startDate ? Date.parse(updates.startDate) : null
  }

  if (updates.dueDate !== undefined) {
    operations.dueDate = updates.dueDate ? Date.parse(updates.dueDate) : null
  }

  if (updates.archived !== undefined) {
    operations.isArchived = updates.archived
  }

  if (Object.keys(operations).length === 0) {
    throw new CliError('VALIDATION_ERROR', 'No board card fields were provided to update.', 4)
  }

  await client.updateDoc(board.class.Card as any, core.space.Space, cardDoc._id, operations as never)

  if (updates.description !== undefined) {
    const summary = await getBoardCardSummary(client, id)
    return {
      ...summary,
      description: updates.description
    }
  }

  return await getBoardCardSummary(client, id)
}

export async function deleteBoardCard(client: HulyClient, id: string): Promise<{ deleted: true, id: string }> {
  const cardDoc = await getBoardCardById(client, id)
  await client.removeDoc(board.class.Card as any, core.space.Space, cardDoc._id)
  return { deleted: true, id }
}

async function getDriveById(client: HulyClient, id: string): Promise<any> {
  const entry = await client.findOne(DRIVE_CLASS as any, { _id: id as never })

  if (!entry) {
    throw new CliError('NOT_FOUND', `Drive '${id}' not found`, 3)
  }

  return entry
}

function mapDriveSummary(entry: any): DriveSummary {
  return {
    id: entry._id,
    name: entry.name,
    description: normalizeUnknownString(entry.description),
    private: Boolean(entry.private),
    archived: Boolean(entry.archived),
    type: normalizeUnknownString(entry.type),
    createdOn: timestampToIso(entry.createdOn),
    modifiedOn: timestampToIso(entry.modifiedOn)
  }
}

export async function listDrives(client: HulyClient): Promise<DriveSummary[]> {
  const entries = await client.findAll(DRIVE_CLASS as any, {}, {
    limit: 100,
    sort: { name: SortingOrder.Ascending }
  })

  return entries.map((entry) => mapDriveSummary(entry))
}

export async function getDriveSummary(client: HulyClient, id: string): Promise<DriveSummary> {
  return mapDriveSummary(await getDriveById(client, id))
}

export async function createDrive(
  client: HulyClient,
  options: {
    name: string
    description?: string
    private?: boolean
  }
): Promise<DriveSummary> {
  const id = await client.createDoc(DRIVE_CLASS as any, core.space.Space, {
    name: options.name,
    description: options.description ?? '',
    type: DRIVE_TYPE,
    private: options.private ?? false,
    archived: false,
    members: []
  } as never)

  return await getDriveSummary(client, id)
}

export async function updateDrive(
  client: HulyClient,
  id: string,
  updates: {
    name?: string
    description?: string
    private?: boolean
    archived?: boolean
  }
): Promise<DriveSummary> {
  const entry = await getDriveById(client, id)
  const operations: Record<string, unknown> = {}

  if (updates.name !== undefined) {
    operations.name = updates.name
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
    throw new CliError('VALIDATION_ERROR', 'No drive fields were provided to update.', 4)
  }

  await client.updateDoc(DRIVE_CLASS as any, core.space.Space, entry._id, operations as never)
  return await getDriveSummary(client, id)
}

export async function deleteDrive(client: HulyClient, id: string): Promise<{ deleted: true, id: string }> {
  const entry = await getDriveById(client, id)
  await client.removeDoc(DRIVE_CLASS as any, core.space.Space, entry._id)
  return { deleted: true, id }
}

async function getDriveResourceById(client: HulyClient, className: string, id: string): Promise<any> {
  const entry = await client.findOne(className as any, { _id: id as never })

  if (!entry) {
    throw new CliError('NOT_FOUND', `Drive resource '${id}' not found`, 3)
  }

  return entry
}

function mapDriveResourceSummary(className: string, entry: any): DriveResourceSummary {
  return {
    id: entry._id,
    class: className === DRIVE_FOLDER_CLASS ? 'folder' : 'file',
    title: normalizeUnknownString(entry.title),
    name: normalizeUnknownString(entry.name),
    docUpdateMessages: typeof entry.docUpdateMessages === 'number' ? entry.docUpdateMessages : null,
    createdOn: timestampToIso(entry.createdOn),
    modifiedOn: timestampToIso(entry.modifiedOn)
  }
}

async function listDriveResources(client: HulyClient, className: string): Promise<DriveResourceSummary[]> {
  const entries = await client.findAll(className as any, {}, {
    limit: 100,
    sort: { title: SortingOrder.Ascending }
  })

  return entries.map((entry) => mapDriveResourceSummary(className, entry))
}

async function getDriveResourceSummary(client: HulyClient, className: string, id: string): Promise<DriveResourceSummary> {
  return mapDriveResourceSummary(className, await getDriveResourceById(client, className, id))
}

async function createDriveResource(
  client: HulyClient,
  className: string,
  options: {
    title: string
    name?: string
  }
): Promise<DriveResourceSummary> {
  const id = await client.createDoc(className as any, core.space.Workspace, {
    title: options.title,
    name: options.name ?? options.title
  } as never)

  return await getDriveResourceSummary(client, className, id)
}

async function updateDriveResource(
  client: HulyClient,
  className: string,
  id: string,
  updates: {
    title?: string
    name?: string
  }
): Promise<DriveResourceSummary> {
  const entry = await getDriveResourceById(client, className, id)
  const operations: Record<string, unknown> = {}

  if (updates.title !== undefined) {
    operations.title = updates.title
  }

  if (updates.name !== undefined) {
    operations.name = updates.name
  }

  if (Object.keys(operations).length === 0) {
    throw new CliError('VALIDATION_ERROR', 'No drive resource fields were provided to update.', 4)
  }

  await client.updateDoc(className as any, core.space.Workspace, entry._id, operations as never)
  return await getDriveResourceSummary(client, className, id)
}

async function deleteDriveResource(client: HulyClient, className: string, id: string): Promise<{ deleted: true, id: string }> {
  const entry = await getDriveResourceById(client, className, id)
  await client.removeDoc(className as any, core.space.Workspace, entry._id)
  return { deleted: true, id }
}

export async function listDriveFolders(client: HulyClient): Promise<DriveResourceSummary[]> {
  return await listDriveResources(client, DRIVE_FOLDER_CLASS)
}

export async function getDriveFolderSummary(client: HulyClient, id: string): Promise<DriveResourceSummary> {
  return await getDriveResourceSummary(client, DRIVE_FOLDER_CLASS, id)
}

export async function createDriveFolder(client: HulyClient, options: { title: string, name?: string }): Promise<DriveResourceSummary> {
  return await createDriveResource(client, DRIVE_FOLDER_CLASS, options)
}

export async function updateDriveFolder(client: HulyClient, id: string, updates: { title?: string, name?: string }): Promise<DriveResourceSummary> {
  return await updateDriveResource(client, DRIVE_FOLDER_CLASS, id, updates)
}

export async function deleteDriveFolder(client: HulyClient, id: string): Promise<{ deleted: true, id: string }> {
  return await deleteDriveResource(client, DRIVE_FOLDER_CLASS, id)
}

export async function listDriveFiles(client: HulyClient): Promise<DriveResourceSummary[]> {
  return await listDriveResources(client, DRIVE_FILE_CLASS)
}

export async function getDriveFileSummary(client: HulyClient, id: string): Promise<DriveResourceSummary> {
  return await getDriveResourceSummary(client, DRIVE_FILE_CLASS, id)
}

export async function createDriveFile(client: HulyClient, options: { title: string, name?: string }): Promise<DriveResourceSummary> {
  return await createDriveResource(client, DRIVE_FILE_CLASS, options)
}

export async function updateDriveFile(client: HulyClient, id: string, updates: { title?: string, name?: string }): Promise<DriveResourceSummary> {
  return await updateDriveResource(client, DRIVE_FILE_CLASS, id, updates)
}

export async function deleteDriveFile(client: HulyClient, id: string): Promise<{ deleted: true, id: string }> {
  return await deleteDriveResource(client, DRIVE_FILE_CLASS, id)
}

async function getHrDepartmentById(client: HulyClient, id: string): Promise<any> {
  const department = await client.findOne(hr.class.Department as any, { _id: id as never })

  if (!department) {
    throw new CliError('NOT_FOUND', `Department '${id}' not found`, 3)
  }

  return department
}

async function mapHrDepartmentSummary(client: HulyClient, department: any): Promise<HrDepartmentSummary> {
  const [personNames, departmentNames] = await Promise.all([
    findPersonNames(client, [department.teamLead]),
    findDepartmentNames(client, [department.parent])
  ])

  return {
    id: department._id,
    name: department.name,
    description: normalizeUnknownString(department.description),
    parentId: normalizeUnknownRef(department.parent),
    parentName: department.parent ? departmentNames.get(department.parent as string) ?? null : null,
    teamLeadId: normalizeUnknownRef(department.teamLead),
    teamLeadName: department.teamLead ? personNames.get(department.teamLead as string) ?? null : null,
    memberIds: (department.members ?? []).map((value: unknown) => String(value)),
    managerIds: (department.managers ?? []).map((value: unknown) => String(value)),
    createdOn: timestampToIso(department.createdOn),
    modifiedOn: timestampToIso(department.modifiedOn)
  }
}

export async function listHrDepartments(client: HulyClient): Promise<HrDepartmentSummary[]> {
  const departments = await client.findAll(hr.class.Department as any, {}, {
    limit: 100,
    sort: { name: SortingOrder.Ascending }
  })

  return await Promise.all(departments.map(async (department) => await mapHrDepartmentSummary(client, department)))
}

export async function getHrDepartmentSummary(client: HulyClient, id: string): Promise<HrDepartmentSummary> {
  return await mapHrDepartmentSummary(client, await getHrDepartmentById(client, id))
}

export async function createHrDepartment(
  client: HulyClient,
  options: {
    name: string
    description?: string
    parent?: string
    teamLead?: string
  }
): Promise<HrDepartmentSummary> {
  const id = await client.createDoc(hr.class.Department as any, core.space.Workspace, {
    name: options.name,
    description: options.description ?? '',
    ...(options.parent === undefined ? {} : { parent: options.parent }),
    teamLead: options.teamLead ?? null,
    members: [],
    managers: []
  } as never)

  return await getHrDepartmentSummary(client, id)
}

export async function updateHrDepartment(
  client: HulyClient,
  id: string,
  updates: {
    name?: string
    description?: string
    parent?: string | null
    teamLead?: string | null
  }
): Promise<HrDepartmentSummary> {
  const department = await getHrDepartmentById(client, id)
  const operations: Record<string, unknown> = {}

  if (updates.name !== undefined) {
    operations.name = updates.name
  }

  if (updates.description !== undefined) {
    operations.description = updates.description
  }

  if (updates.parent !== undefined) {
    operations.parent = updates.parent
  }

  if (updates.teamLead !== undefined) {
    operations.teamLead = updates.teamLead
  }

  if (Object.keys(operations).length === 0) {
    throw new CliError('VALIDATION_ERROR', 'No department fields were provided to update.', 4)
  }

  await client.updateDoc(hr.class.Department as any, core.space.Workspace, department._id, operations as never)
  return await getHrDepartmentSummary(client, id)
}

export async function deleteHrDepartment(client: HulyClient, id: string): Promise<{ deleted: true, id: string }> {
  const department = await getHrDepartmentById(client, id)
  await client.removeDoc(hr.class.Department as any, core.space.Workspace, department._id)
  return { deleted: true, id }
}

function mapHrEmployeeSummary(employee: any, email: string | null, departmentName: string | null): HrEmployeeSummary {
  const employeeMixin = employee['contact:mixin:Employee'] ?? {}
  const staffMixin = employee['hr:mixin:Staff'] ?? {}

  return {
    id: employee._id,
    name: employee.name,
    email,
    departmentId: normalizeUnknownRef(staffMixin.department),
    departmentName,
    active: typeof employeeMixin.active === 'boolean' ? employeeMixin.active : null,
    role: normalizeUnknownString(employeeMixin.role),
    personUuid: normalizeUnknownString(employee.personUuid)
  }
}

export async function listHrEmployees(client: HulyClient, limit?: number): Promise<HrEmployeeSummary[]> {
  const employees = await client.findAll(hr.mixin.Staff as any, {}, {
    limit: limit ?? 100,
    sort: { name: SortingOrder.Ascending }
  }) as any[]
  const departmentNames = await findDepartmentNames(
    client,
    employees.map((employee) => (employee['hr:mixin:Staff'] ?? {}).department as string | undefined)
  )

  return await Promise.all(employees.map(async (employee) => {
    const departmentId = normalizeUnknownRef((employee['hr:mixin:Staff'] ?? {}).department)
    return mapHrEmployeeSummary(
      employee,
      await findEmailForPerson(client, employee._id),
      departmentId ? departmentNames.get(departmentId) ?? null : null
    )
  }))
}

export async function getHrEmployeeSummary(client: HulyClient, id: string): Promise<HrEmployeeSummary> {
  const employee = await client.findOne(hr.mixin.Staff as any, { _id: id as never }) as any

  if (!employee) {
    throw new CliError('NOT_FOUND', `Employee '${id}' not found`, 3)
  }

  const departmentId = normalizeUnknownRef((employee['hr:mixin:Staff'] ?? {}).department)
  const departmentNames = await findDepartmentNames(client, [departmentId])

  return mapHrEmployeeSummary(
    employee,
    await findEmailForPerson(client, employee._id),
    departmentId ? departmentNames.get(departmentId) ?? null : null
  )
}

export async function listHrRequestTypes(client: HulyClient): Promise<HrRequestTypeSummary[]> {
  const requestTypes = await client.findAll(hr.class.RequestType as any, {}, {
    limit: 100,
    sort: { value: SortingOrder.Ascending }
  }) as any[]

  return requestTypes.map((entry) => ({
    id: entry._id,
    label: pluginLabelToText(normalizeUnknownString(entry.label)) ?? entry._id,
    value: typeof entry.value === 'number' ? entry.value : null,
    color: typeof entry.color === 'number' ? entry.color : null
  }))
}

async function getHrPublicHolidayById(client: HulyClient, id: string): Promise<any> {
  const holiday = await client.findOne(hr.class.PublicHoliday as any, { _id: id as never })

  if (!holiday) {
    throw new CliError('NOT_FOUND', `Public holiday '${id}' not found`, 3)
  }

  return holiday
}

async function mapHrPublicHolidaySummary(client: HulyClient, holiday: any): Promise<HrPublicHolidaySummary> {
  const departmentNames = await findDepartmentNames(client, [holiday.department])

  return {
    id: holiday._id,
    title: holiday.title,
    description: normalizeUnknownString(holiday.description),
    date: tzDateToIso(holiday.date),
    departmentId: normalizeUnknownRef(holiday.department),
    departmentName: holiday.department ? departmentNames.get(holiday.department as string) ?? null : null,
    createdOn: timestampToIso(holiday.createdOn),
    modifiedOn: timestampToIso(holiday.modifiedOn)
  }
}

export async function listHrPublicHolidays(client: HulyClient, departmentId?: string): Promise<HrPublicHolidaySummary[]> {
  const holidays = await client.findAll(hr.class.PublicHoliday as any, departmentId ? { department: departmentId as never } : {}, {
    limit: 100,
    sort: { createdOn: SortingOrder.Descending }
  })

  return await Promise.all(holidays.map(async (holiday) => await mapHrPublicHolidaySummary(client, holiday)))
}

export async function getHrPublicHolidaySummary(client: HulyClient, id: string): Promise<HrPublicHolidaySummary> {
  return await mapHrPublicHolidaySummary(client, await getHrPublicHolidayById(client, id))
}

export async function createHrPublicHoliday(
  client: HulyClient,
  options: {
    title: string
    description?: string
    date: string
    departmentId?: string
  }
): Promise<HrPublicHolidaySummary> {
  const id = await client.createDoc(hr.class.PublicHoliday as any, core.space.Workspace, {
    title: options.title,
    description: options.description ?? '',
    date: isoToTzDate(options.date),
    department: options.departmentId ?? hr.ids.Head
  } as never)

  return await getHrPublicHolidaySummary(client, id)
}

export async function updateHrPublicHoliday(
  client: HulyClient,
  id: string,
  updates: {
    title?: string
    description?: string
    date?: string
    departmentId?: string
  }
): Promise<HrPublicHolidaySummary> {
  const holiday = await getHrPublicHolidayById(client, id)
  const operations: Record<string, unknown> = {}

  if (updates.title !== undefined) {
    operations.title = updates.title
  }

  if (updates.description !== undefined) {
    operations.description = updates.description
  }

  if (updates.date !== undefined) {
    operations.date = isoToTzDate(updates.date)
  }

  if (updates.departmentId !== undefined) {
    operations.department = updates.departmentId
  }

  if (Object.keys(operations).length === 0) {
    throw new CliError('VALIDATION_ERROR', 'No public holiday fields were provided to update.', 4)
  }

  await client.updateDoc(hr.class.PublicHoliday as any, core.space.Workspace, holiday._id, operations as never)
  return await getHrPublicHolidaySummary(client, id)
}

export async function deleteHrPublicHoliday(client: HulyClient, id: string): Promise<{ deleted: true, id: string }> {
  const holiday = await getHrPublicHolidayById(client, id)
  await client.removeDoc(hr.class.PublicHoliday as any, core.space.Workspace, holiday._id)
  return { deleted: true, id }
}

async function getHrRequestById(client: HulyClient, id: string): Promise<any> {
  const request = await client.findOne(hr.class.Request as any, { _id: id as never })

  if (!request) {
    throw new CliError('NOT_FOUND', `Request '${id}' not found`, 3)
  }

  return request
}

async function getCurrentPersonId(client: HulyClient): Promise<string> {
  const account = await client.getAccount()
  const current = await client.findOne(contact.mixin.Employee, { personUuid: account.uuid as never })

  if (!current) {
    throw new CliError('NOT_FOUND', 'Current member not found in the workspace', 3)
  }

  return current._id as string
}

async function mapHrRequestSummary(client: HulyClient, request: any): Promise<HrRequestSummary> {
  const [personNames, departmentNames, requestTypes] = await Promise.all([
    findPersonNames(client, [request.attachedTo]),
    findDepartmentNames(client, [request.department]),
    client.findAll(hr.class.RequestType as any, { _id: { $in: [request.type].filter(Boolean) as never[] } }, { limit: 1 })
  ])
  const requestType = (requestTypes as any[])[0]

  return {
    id: request._id,
    employeeId: normalizeUnknownRef(request.attachedTo),
    employeeName: request.attachedTo ? personNames.get(request.attachedTo as string) ?? null : null,
    departmentId: normalizeUnknownRef(request.department),
    departmentName: request.department ? departmentNames.get(request.department as string) ?? null : null,
    typeId: normalizeUnknownRef(request.type),
    typeLabel: requestType ? pluginLabelToText(normalizeUnknownString(requestType.label)) ?? requestType._id : normalizeUnknownRef(request.type),
    description: normalizeUnknownString(request.description),
    date: tzDateToIso(request.tzDate),
    dueDate: tzDateToIso(request.tzDueDate),
    createdOn: timestampToIso(request.createdOn),
    modifiedOn: timestampToIso(request.modifiedOn)
  }
}

export async function listHrRequests(client: HulyClient, employeeId?: string): Promise<HrRequestSummary[]> {
  const requests = await client.findAll(hr.class.Request as any, employeeId ? { attachedTo: employeeId as never } : {}, {
    limit: 100,
    sort: { createdOn: SortingOrder.Descending }
  })

  return await Promise.all(requests.map(async (request) => await mapHrRequestSummary(client, request)))
}

export async function getHrRequestSummary(client: HulyClient, id: string): Promise<HrRequestSummary> {
  return await mapHrRequestSummary(client, await getHrRequestById(client, id))
}

export async function createHrRequest(
  client: HulyClient,
  options: {
    employeeId?: string
    departmentId?: string
    typeId: string
    description?: string
    date: string
    dueDate?: string
  }
): Promise<HrRequestSummary> {
  const employeeId = options.employeeId ?? await getCurrentPersonId(client)
  const employee = await client.findOne(contact.class.Person, { _id: employeeId as never }) as any

  if (!employee) {
    throw new CliError('NOT_FOUND', `Employee '${employeeId}' not found`, 3)
  }

  const departmentId = options.departmentId ?? normalizeUnknownRef((employee['hr:mixin:Staff'] ?? {}).department) ?? 'hr:ids:Head'

  const id = await client.addCollection(
    hr.class.Request as any,
    core.space.Workspace,
    employeeId as any,
    contact.class.Person as any,
    HR_REQUEST_COLLECTION,
    {
      attachedToClass: contact.class.Person,
      department: departmentId,
      type: options.typeId,
      description: options.description ?? '',
      tzDate: isoToTzDate(options.date),
      tzDueDate: isoToTzDate(options.dueDate ?? options.date)
    } as never
  )

  return await getHrRequestSummary(client, id)
}

export async function updateHrRequest(
  client: HulyClient,
  id: string,
  updates: {
    departmentId?: string
    typeId?: string
    description?: string
    date?: string
    dueDate?: string
  }
): Promise<HrRequestSummary> {
  const request = await getHrRequestById(client, id)
  const operations: Record<string, unknown> = {}

  if (updates.departmentId !== undefined) {
    operations.department = updates.departmentId
  }

  if (updates.typeId !== undefined) {
    operations.type = updates.typeId
  }

  if (updates.description !== undefined) {
    operations.description = updates.description
  }

  if (updates.date !== undefined) {
    operations.tzDate = isoToTzDate(updates.date)
  }

  if (updates.dueDate !== undefined) {
    operations.tzDueDate = isoToTzDate(updates.dueDate)
  }

  if (Object.keys(operations).length === 0) {
    throw new CliError('VALIDATION_ERROR', 'No request fields were provided to update.', 4)
  }

  await client.updateDoc(hr.class.Request as any, core.space.Workspace, request._id, operations as never)
  return await getHrRequestSummary(client, id)
}

export async function deleteHrRequest(client: HulyClient, id: string): Promise<{ deleted: true, id: string }> {
  const request = await getHrRequestById(client, id)
  await client.removeDoc(hr.class.Request as any, core.space.Workspace, request._id)
  return { deleted: true, id }
}

async function getRecruitVacancyById(client: HulyClient, id: string): Promise<any> {
  const vacancy = await client.findOne(RECRUIT_VACANCY_CLASS as any, { _id: id as never })

  if (!vacancy) {
    throw new CliError('NOT_FOUND', `Vacancy '${id}' not found`, 3)
  }

  return vacancy
}

async function mapRecruitVacancySummary(client: HulyClient, vacancy: any): Promise<RecruitVacancySummary> {
  const applicants = await client.findAll(RECRUIT_APPLICANT_CLASS as any, { attachedTo: vacancy._id as never }, { limit: 1 })

  return {
    id: vacancy._id,
    name: vacancy.name,
    description: normalizeUnknownString(vacancy.description),
    fullDescription: vacancy.fullDescription
      ? await client.fetchMarkup(RECRUIT_VACANCY_CLASS as any, vacancy._id, 'fullDescription', vacancy.fullDescription, 'markdown')
      : null,
    location: normalizeUnknownString(vacancy.location),
    dueDate: timestampToIso(vacancy.dueTo),
    private: Boolean(vacancy.private),
    archived: Boolean(vacancy.archived),
    type: normalizeUnknownString(vacancy.type),
    applicantCount: applicants.length,
    createdOn: timestampToIso(vacancy.createdOn),
    modifiedOn: timestampToIso(vacancy.modifiedOn)
  }
}

export async function listRecruitVacancies(client: HulyClient): Promise<RecruitVacancySummary[]> {
  const vacancies = await client.findAll(RECRUIT_VACANCY_CLASS as any, {}, {
    limit: 100,
    sort: { name: SortingOrder.Ascending }
  })

  return await Promise.all(vacancies.map(async (vacancy) => await mapRecruitVacancySummary(client, vacancy)))
}

export async function getRecruitVacancySummary(client: HulyClient, id: string): Promise<RecruitVacancySummary> {
  return await mapRecruitVacancySummary(client, await getRecruitVacancyById(client, id))
}

export async function createRecruitVacancy(
  client: HulyClient,
  options: {
    name: string
    description?: string
    fullDescription?: string
    location?: string
    dueDate?: string
    private?: boolean
  }
): Promise<RecruitVacancySummary> {
  const id = await client.createDoc(RECRUIT_VACANCY_CLASS as any, core.space.Space, {
    name: options.name,
    description: options.description ?? '',
    fullDescription: options.fullDescription ? markdown(options.fullDescription) : null,
    ...(options.location === undefined ? {} : { location: options.location }),
    ...(options.dueDate === undefined ? {} : { dueTo: new Date(options.dueDate).getTime() }),
    type: RECRUIT_VACANCY_TYPE,
    private: options.private ?? false,
    archived: false,
    members: []
  } as never)

  return await getRecruitVacancySummary(client, id)
}

export async function updateRecruitVacancy(
  client: HulyClient,
  id: string,
  updates: {
    name?: string
    description?: string
    location?: string
    dueDate?: string
    private?: boolean
    archived?: boolean
  }
): Promise<RecruitVacancySummary> {
  const vacancy = await getRecruitVacancyById(client, id)
  const operations: Record<string, unknown> = {}

  if (updates.name !== undefined) {
    operations.name = updates.name
  }

  if (updates.description !== undefined) {
    operations.description = updates.description
  }

  if (updates.location !== undefined) {
    operations.location = updates.location
  }

  if (updates.dueDate !== undefined) {
    operations.dueTo = new Date(updates.dueDate).getTime()
  }

  if (updates.private !== undefined) {
    operations.private = updates.private
  }

  if (updates.archived !== undefined) {
    operations.archived = updates.archived
  }

  if (Object.keys(operations).length === 0) {
    throw new CliError('VALIDATION_ERROR', 'No vacancy fields were provided to update.', 4)
  }

  await client.updateDoc(RECRUIT_VACANCY_CLASS as any, core.space.Space, vacancy._id, operations as never)
  return await getRecruitVacancySummary(client, id)
}

export async function deleteRecruitVacancy(client: HulyClient, id: string): Promise<{ deleted: true, id: string }> {
  const vacancy = await getRecruitVacancyById(client, id)
  await client.removeDoc(RECRUIT_VACANCY_CLASS as any, core.space.Space, vacancy._id)
  return { deleted: true, id }
}

async function getRecruitApplicantById(client: HulyClient, id: string): Promise<any> {
  const applicant = await client.findOne(RECRUIT_APPLICANT_CLASS as any, { _id: id as never })

  if (!applicant) {
    throw new CliError('NOT_FOUND', `Applicant '${id}' not found`, 3)
  }

  return applicant
}

export async function listRecruitApplicantStatuses(client: HulyClient): Promise<RecruitApplicantStatusSummary[]> {
  const taskType = await client.findOne(task.class.TaskType as any, { _id: RECRUIT_APPLICANT_TASK_TYPE as never }) as any

  if (!taskType) {
    throw new CliError('NOT_FOUND', `Recruit applicant task type '${RECRUIT_APPLICANT_TASK_TYPE}' not found`, 3)
  }

  const statusIds = (taskType?.statuses ?? []).map((status: unknown) => String(status))

  if (statusIds.length === 0) {
    return []
  }

  const statuses = await client.findAll(core.class.Status, { _id: { $in: statusIds as never[] } }, { limit: statusIds.length || 20 })
  const statusById = new Map(statuses.map((status) => [status._id as string, status]))

  return statusIds.map((id: string) => {
    const status = statusById.get(id)

    return {
      id,
      name: status?.name ?? id,
      color: typeof status?.color === 'number' ? status.color : null
    }
  })
}

async function resolveRecruitApplicantStatus(client: HulyClient, value: string): Promise<string> {
  const status = (await listRecruitApplicantStatuses(client)).find((entry) => normalizeString(entry.name) === normalizeString(value))

  if (!status) {
    throw new CliError('NOT_FOUND', `Recruit applicant status '${value}' not found`, 3)
  }

  return status.id
}

async function mapRecruitApplicantSummary(client: HulyClient, applicant: any): Promise<RecruitApplicantSummary> {
  const [vacancy, assigneeNames, statuses] = await Promise.all([
    applicant.attachedTo ? client.findOne(RECRUIT_VACANCY_CLASS as any, { _id: applicant.attachedTo as never }) : Promise.resolve(undefined),
    findPersonNames(client, [applicant.assignee]),
    applicant.status
      ? client.findAll(core.class.Status, { _id: { $in: [applicant.status] as never[] } }, { limit: 1 })
      : Promise.resolve([])
  ])
  const vacancyEntry = vacancy as any
  const status = (statuses as any[])[0]

  return {
    id: applicant._id,
    vacancyId: normalizeUnknownRef(applicant.attachedTo),
    vacancyName: vacancyEntry ? vacancyEntry.name : null,
    identifier: normalizeUnknownString(applicant.identifier),
    number: typeof applicant.number === 'number' ? applicant.number : null,
    status: status?.name ?? normalizeUnknownRef(applicant.status),
    assigneeId: normalizeUnknownRef(applicant.assignee),
    assigneeName: applicant.assignee ? assigneeNames.get(applicant.assignee as string) ?? null : null,
    startDate: typeof applicant.startDate === 'number' && applicant.startDate > 0 ? timestampToIso(applicant.startDate) : null,
    dueDate: typeof applicant.dueDate === 'number' && applicant.dueDate > 0 ? timestampToIso(applicant.dueDate) : null,
    createdOn: timestampToIso(applicant.createdOn),
    modifiedOn: timestampToIso(applicant.modifiedOn)
  }
}

export async function listRecruitApplicants(client: HulyClient, vacancyId?: string): Promise<RecruitApplicantSummary[]> {
  const applicants = await client.findAll(
    RECRUIT_APPLICANT_CLASS as any,
    vacancyId ? { attachedTo: vacancyId as never } : {},
    {
      limit: 100,
      sort: { createdOn: SortingOrder.Descending }
    }
  )

  return await Promise.all(applicants.map(async (applicant) => await mapRecruitApplicantSummary(client, applicant)))
}

export async function getRecruitApplicantSummary(client: HulyClient, id: string): Promise<RecruitApplicantSummary> {
  return await mapRecruitApplicantSummary(client, await getRecruitApplicantById(client, id))
}

export async function createRecruitApplicant(
  client: HulyClient,
  options: {
    vacancyId: string
    identifier: string
    status?: string
    assigneeId?: string
    startDate?: string
    dueDate?: string
  }
): Promise<RecruitApplicantSummary> {
  const vacancy = await getRecruitVacancyById(client, options.vacancyId)
  const [lastByNumber] = await client.findAll(RECRUIT_APPLICANT_CLASS as any, {
    attachedTo: vacancy._id as never
  }, {
    limit: 1,
    sort: { number: SortingOrder.Descending }
  }) as any[]
  const [lastByRank] = await client.findAll(RECRUIT_APPLICANT_CLASS as any, {
    attachedTo: vacancy._id as never
  }, {
    limit: 1,
    sort: { rank: SortingOrder.Descending }
  }) as any[]
  const statusId = options.status ? await resolveRecruitApplicantStatus(client, options.status) : 'recruit:taskTypeStatus:Backlog'

  const id = await client.addCollection(
    RECRUIT_APPLICANT_CLASS as any,
    core.space.Space,
    vacancy._id,
    RECRUIT_VACANCY_CLASS as any,
    RECRUIT_APPLICANT_COLLECTION,
    {
      status: statusId,
      kind: RECRUIT_APPLICANT_TASK_TYPE,
      number: (typeof lastByNumber?.number === 'number' ? lastByNumber.number : 0) + 1,
      assignee: options.assigneeId ?? null,
      startDate: options.startDate ? new Date(options.startDate).getTime() : null,
      dueDate: options.dueDate ? new Date(options.dueDate).getTime() : null,
      identifier: options.identifier,
      rank: makeRank(lastByRank?.rank, undefined)
    } as never
  )

  return await getRecruitApplicantSummary(client, id)
}

export async function updateRecruitApplicant(
  client: HulyClient,
  id: string,
  updates: {
    identifier?: string
    status?: string
    assigneeId?: string | null
    startDate?: string | null
    dueDate?: string | null
  }
): Promise<RecruitApplicantSummary> {
  const applicant = await getRecruitApplicantById(client, id)
  const operations: Record<string, unknown> = {}

  if (updates.identifier !== undefined) {
    operations.identifier = updates.identifier
  }

  if (updates.status !== undefined) {
    operations.status = await resolveRecruitApplicantStatus(client, updates.status)
  }

  if (updates.assigneeId !== undefined) {
    operations.assignee = updates.assigneeId
  }

  if (updates.startDate !== undefined) {
    operations.startDate = updates.startDate === null ? null : new Date(updates.startDate).getTime()
  }

  if (updates.dueDate !== undefined) {
    operations.dueDate = updates.dueDate === null ? null : new Date(updates.dueDate).getTime()
  }

  if (Object.keys(operations).length === 0) {
    throw new CliError('VALIDATION_ERROR', 'No applicant fields were provided to update.', 4)
  }

  await client.updateDoc(RECRUIT_APPLICANT_CLASS as any, core.space.Space, applicant._id, operations as never)
  return await getRecruitApplicantSummary(client, id)
}

export async function deleteRecruitApplicant(client: HulyClient, id: string): Promise<{ deleted: true, id: string }> {
  const applicant = await getRecruitApplicantById(client, id)
  await client.removeDoc(RECRUIT_APPLICANT_CLASS as any, core.space.Space, applicant._id)
  return { deleted: true, id }
}

async function getRecruitCandidateById(client: HulyClient, id: string): Promise<any> {
  const candidate = await client.findOne(RECRUIT_CANDIDATE_MIXIN as any, { _id: id as never })

  if (!candidate) {
    throw new CliError('NOT_FOUND', `Candidate '${id}' not found`, 3)
  }

  return candidate
}

function mapRecruitCandidateSummary(candidate: any): RecruitCandidateSummary {
  const mixin = candidate[RECRUIT_CANDIDATE_MIXIN] ?? {}

  return {
    id: candidate._id,
    name: candidate.name,
    city: normalizeUnknownString(candidate.city),
    title: normalizeUnknownString(mixin.title),
    source: normalizeUnknownString(mixin.source),
    remote: typeof mixin.remote === 'boolean' ? mixin.remote : null,
    onsite: typeof mixin.onsite === 'boolean' ? mixin.onsite : null,
    applications: typeof mixin.applications === 'number' ? mixin.applications : null,
    reviews: typeof mixin.reviews === 'number' ? mixin.reviews : null,
    createdOn: timestampToIso(candidate.createdOn),
    modifiedOn: timestampToIso(candidate.modifiedOn)
  }
}

export async function listRecruitCandidates(client: HulyClient): Promise<RecruitCandidateSummary[]> {
  const candidates = await client.findAll(RECRUIT_CANDIDATE_MIXIN as any, {}, {
    limit: 100,
    sort: { name: SortingOrder.Ascending }
  })

  return candidates.map((candidate) => mapRecruitCandidateSummary(candidate))
}

export async function getRecruitCandidateSummary(client: HulyClient, id: string): Promise<RecruitCandidateSummary> {
  return mapRecruitCandidateSummary(await getRecruitCandidateById(client, id))
}

export async function createRecruitCandidate(
  client: HulyClient,
  options: {
    name: string
    city?: string
    title?: string
    source?: string
    remote?: boolean
    onsite?: boolean
  }
): Promise<RecruitCandidateSummary> {
  const id = await client.createDoc(contact.class.Person as any, 'contact:space:Contacts' as any, {
    name: options.name,
    city: options.city ?? ''
  } as never)

  await client.updateDoc(contact.class.Person as any, 'contact:space:Contacts' as any, id as any, {
    [RECRUIT_CANDIDATE_MIXIN]: {
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.source === undefined ? {} : { source: options.source }),
      ...(options.remote === undefined ? {} : { remote: options.remote }),
      ...(options.onsite === undefined ? {} : { onsite: options.onsite })
    }
  } as never)

  return await getRecruitCandidateSummary(client, id)
}

export async function updateRecruitCandidate(
  client: HulyClient,
  id: string,
  updates: {
    name?: string
    city?: string
    title?: string
    source?: string
    remote?: boolean
    onsite?: boolean
  }
): Promise<RecruitCandidateSummary> {
  const candidate = await getRecruitCandidateById(client, id)
  const personOperations: Record<string, unknown> = {}
  const mixinOperations: Record<string, unknown> = {}

  if (updates.name !== undefined) {
    personOperations.name = updates.name
  }

  if (updates.city !== undefined) {
    personOperations.city = updates.city
  }

  if (updates.title !== undefined) {
    mixinOperations.title = updates.title
  }

  if (updates.source !== undefined) {
    mixinOperations.source = updates.source
  }

  if (updates.remote !== undefined) {
    mixinOperations.remote = updates.remote
  }

  if (updates.onsite !== undefined) {
    mixinOperations.onsite = updates.onsite
  }

  if (Object.keys(personOperations).length === 0 && Object.keys(mixinOperations).length === 0) {
    throw new CliError('VALIDATION_ERROR', 'No candidate fields were provided to update.', 4)
  }

  if (Object.keys(mixinOperations).length > 0) {
    personOperations[RECRUIT_CANDIDATE_MIXIN] = {
      ...(candidate[RECRUIT_CANDIDATE_MIXIN] ?? {}),
      ...mixinOperations
    }
  }

  await client.updateDoc(contact.class.Person as any, 'contact:space:Contacts' as any, candidate._id, personOperations as never)
  return await getRecruitCandidateSummary(client, id)
}

export async function deleteRecruitCandidate(client: HulyClient, id: string): Promise<{ deleted: true, id: string }> {
  const candidate = await getRecruitCandidateById(client, id)
  await client.removeDoc(contact.class.Person as any, 'contact:space:Contacts' as any, candidate._id)
  return { deleted: true, id }
}

async function getRecruitReviewById(client: HulyClient, id: string): Promise<any> {
  const review = await client.findOne(RECRUIT_REVIEW_CLASS as any, { _id: id as never })

  if (!review) {
    throw new CliError('NOT_FOUND', `Review '${id}' not found`, 3)
  }

  return review
}

async function mapRecruitReviewSummaries(
  client: HulyClient,
  reviews: any[],
  options: {
    includeDescription: boolean
  }
): Promise<RecruitReviewSummary[]> {
  const candidateIds = reviews.map((review) => normalizeUnknownRef(review.attachedTo))
  const candidateNames = await findPersonNames(client, candidateIds)

  return await Promise.all(reviews.map(async (review) => ({
    id: review._id,
    candidateId: normalizeUnknownRef(review.attachedTo),
    candidateName: candidateNames.get(review.attachedTo) ?? null,
    title: review.title,
    description: options.includeDescription && review.description
      ? await client.fetchMarkup(RECRUIT_REVIEW_CLASS as any, review._id, 'description', review.description as never, 'markdown')
      : null,
    verdict: normalizeUnknownString(review.verdict),
    applicantId: normalizeUnknownRef(review.application),
    location: normalizeUnknownString(review.location),
    date: timestampToIso(review.date),
    dueDate: timestampToIso(review.dueDate),
    allDay: Boolean(review.allDay),
    opinionCount: typeof review.opinions === 'number' ? review.opinions : null,
    createdOn: timestampToIso(review.createdOn),
    modifiedOn: timestampToIso(review.modifiedOn)
  })))
}

export async function listRecruitReviews(
  client: HulyClient,
  options: {
    candidateId?: string
    applicantId?: string
    limit?: number
  }
): Promise<RecruitReviewSummary[]> {
  const query: Record<string, unknown> = {}

  if (options.candidateId !== undefined) {
    query.attachedTo = (await getRecruitCandidateById(client, options.candidateId))._id
  }

  if (options.applicantId !== undefined) {
    query.application = (await getRecruitApplicantById(client, options.applicantId))._id
  }

  const reviews = await client.findAll(RECRUIT_REVIEW_CLASS as any, query as never, {
    limit: options.limit ?? 50,
    sort: { createdOn: SortingOrder.Descending }
  })

  return await mapRecruitReviewSummaries(client, reviews, { includeDescription: false })
}

export async function getRecruitReviewSummary(client: HulyClient, id: string): Promise<RecruitReviewSummary> {
  const [summary] = await mapRecruitReviewSummaries(client, [await getRecruitReviewById(client, id)], { includeDescription: true })
  return summary
}

export async function createRecruitReview(
  client: HulyClient,
  options: {
    candidateId: string
    title: string
    verdict: string
    description?: string
    location?: string
    date: string
    dueDate?: string
    applicantId?: string
  }
): Promise<RecruitReviewSummary> {
  const candidate = await getRecruitCandidateById(client, options.candidateId)
  const applicantId = options.applicantId !== undefined
    ? (await getRecruitApplicantById(client, options.applicantId))._id
    : undefined
  const currentPersonId = await getCurrentPersonId(client)
  const [lastReview] = await client.findAll(RECRUIT_REVIEW_CLASS as any, {
    attachedTo: candidate._id as never
  }, {
    limit: 1,
    sort: { number: SortingOrder.Descending }
  }) as any[]
  const id = await client.addCollection(
    RECRUIT_REVIEW_CLASS as any,
    core.space.Space,
    candidate._id,
    contact.class.Person as any,
    RECRUIT_REVIEW_COLLECTION,
    {
      eventId: generateId(),
      title: requireNonEmptyString(options.title, 'Review title'),
      description: options.description ? markdown(options.description) : '',
      calendar: DEFAULT_CALENDAR,
      location: options.location ?? '',
      allDay: true,
      date: new Date(options.date).getTime(),
      dueDate: new Date(options.dueDate ?? options.date).getTime(),
      participants: [],
      access: 'owner',
      user: currentPersonId,
      blockTime: false,
      number: (typeof lastReview?.number === 'number' ? lastReview.number : 0) + 1,
      verdict: requireNonEmptyString(options.verdict, 'Review verdict'),
      ...(applicantId === undefined ? {} : { application: applicantId })
    } as never
  )

  const summary = await getRecruitReviewSummary(client, id)
  return {
    ...summary,
    description: options.description ?? summary.description
  }
}

export async function updateRecruitReview(
  client: HulyClient,
  id: string,
  updates: {
    title?: string
    verdict?: string
    description?: string
    location?: string | null
    date?: string
    dueDate?: string
    applicantId?: string | null
  }
): Promise<RecruitReviewSummary> {
  const review = await getRecruitReviewById(client, id)
  const operations: Record<string, unknown> = {}

  if (updates.title !== undefined) {
    operations.title = requireNonEmptyString(updates.title, 'Review title')
  }

  if (updates.verdict !== undefined) {
    operations.verdict = requireNonEmptyString(updates.verdict, 'Review verdict')
  }

  if (updates.description !== undefined) {
    operations.description = updates.description ? markdown(updates.description) : ''
  }

  if (updates.location !== undefined) {
    operations.location = updates.location ?? ''
  }

  if (updates.date !== undefined) {
    operations.date = new Date(updates.date).getTime()
  }

  if (updates.dueDate !== undefined) {
    operations.dueDate = new Date(updates.dueDate).getTime()
  }

  if (updates.applicantId !== undefined) {
    operations.application = updates.applicantId === null ? null : (await getRecruitApplicantById(client, updates.applicantId))._id
  }

  if (Object.keys(operations).length === 0) {
    throw new CliError('VALIDATION_ERROR', 'No review fields were provided to update.', 4)
  }

  await client.updateDoc(RECRUIT_REVIEW_CLASS as any, core.space.Space, review._id, operations as never)

  if (updates.description !== undefined) {
    const summary = await getRecruitReviewSummary(client, id)
    return {
      ...summary,
      description: updates.description
    }
  }

  return await getRecruitReviewSummary(client, id)
}

export async function deleteRecruitReview(client: HulyClient, id: string): Promise<{ deleted: true, id: string }> {
  const review = await getRecruitReviewById(client, id)
  await client.removeDoc(RECRUIT_REVIEW_CLASS as any, core.space.Space, review._id)
  return { deleted: true, id }
}

async function getRecruitOpinionById(client: HulyClient, id: string): Promise<any> {
  const opinion = await client.findOne(RECRUIT_OPINION_CLASS as any, { _id: id as never })

  if (!opinion) {
    throw new CliError('NOT_FOUND', `Opinion '${id}' not found`, 3)
  }

  return opinion
}

async function mapRecruitOpinionSummaries(
  client: HulyClient,
  opinions: any[],
  options: {
    includeDescription: boolean
  }
): Promise<RecruitOpinionSummary[]> {
  const reviewIds = Array.from(new Set(
    opinions
      .map((opinion) => normalizeUnknownRef(opinion.attachedTo))
      .filter((value): value is string => value !== null)
  ))
  const reviews = reviewIds.length > 0
    ? await client.findAll(RECRUIT_REVIEW_CLASS as any, { _id: { $in: reviewIds as never[] } }, { limit: reviewIds.length })
    : []
  const reviewTitleById = new Map<string, string>(reviews.map((review) => [review._id as string, (review as any).title as string]))

  return await Promise.all(opinions.map(async (opinion) => ({
    id: opinion._id,
    reviewId: normalizeUnknownRef(opinion.attachedTo),
    reviewTitle: reviewTitleById.get(opinion.attachedTo) ?? null,
    value: normalizeUnknownString(opinion.value),
    description: options.includeDescription && opinion.description
      ? await client.fetchMarkup(RECRUIT_OPINION_CLASS as any, opinion._id, 'description', opinion.description as never, 'markdown')
      : null,
    number: typeof opinion.number === 'number' ? opinion.number : null,
    createdOn: timestampToIso(opinion.createdOn),
    modifiedOn: timestampToIso(opinion.modifiedOn)
  })))
}

export async function listRecruitOpinions(
  client: HulyClient,
  options: {
    reviewId?: string
    limit?: number
  }
): Promise<RecruitOpinionSummary[]> {
  const query: Record<string, unknown> = {}

  if (options.reviewId !== undefined) {
    query.attachedTo = (await getRecruitReviewById(client, options.reviewId))._id
  }

  const opinions = await client.findAll(RECRUIT_OPINION_CLASS as any, query as never, {
    limit: options.limit ?? 50,
    sort: { createdOn: SortingOrder.Descending }
  })

  return await mapRecruitOpinionSummaries(client, opinions, { includeDescription: false })
}

export async function getRecruitOpinionSummary(client: HulyClient, id: string): Promise<RecruitOpinionSummary> {
  const [summary] = await mapRecruitOpinionSummaries(client, [await getRecruitOpinionById(client, id)], { includeDescription: true })
  return summary
}

export async function createRecruitOpinion(
  client: HulyClient,
  options: {
    reviewId: string
    value: string
    description?: string
  }
): Promise<RecruitOpinionSummary> {
  const review = await getRecruitReviewById(client, options.reviewId)
  const [lastOpinion] = await client.findAll(RECRUIT_OPINION_CLASS as any, {
    attachedTo: review._id as never
  }, {
    limit: 1,
    sort: { number: SortingOrder.Descending }
  }) as any[]
  const id = await client.addCollection(
    RECRUIT_OPINION_CLASS as any,
    core.space.Space,
    review._id,
    RECRUIT_REVIEW_CLASS as any,
    RECRUIT_OPINION_COLLECTION,
    {
      number: (typeof lastOpinion?.number === 'number' ? lastOpinion.number : 0) + 1,
      description: options.description ? markdown(options.description) : '',
      value: requireNonEmptyString(options.value, 'Opinion value')
    } as never
  )

  const summary = await getRecruitOpinionSummary(client, id)
  return {
    ...summary,
    description: options.description ?? summary.description
  }
}

export async function updateRecruitOpinion(
  client: HulyClient,
  id: string,
  updates: {
    value?: string
    description?: string
  }
): Promise<RecruitOpinionSummary> {
  const opinion = await getRecruitOpinionById(client, id)
  const operations: Record<string, unknown> = {}

  if (updates.value !== undefined) {
    operations.value = requireNonEmptyString(updates.value, 'Opinion value')
  }

  if (updates.description !== undefined) {
    operations.description = updates.description ? markdown(updates.description) : ''
  }

  if (Object.keys(operations).length === 0) {
    throw new CliError('VALIDATION_ERROR', 'No opinion fields were provided to update.', 4)
  }

  await client.updateDoc(RECRUIT_OPINION_CLASS as any, core.space.Space, opinion._id, operations as never)

  if (updates.description !== undefined) {
    const summary = await getRecruitOpinionSummary(client, id)
    return {
      ...summary,
      description: updates.description
    }
  }

  return await getRecruitOpinionSummary(client, id)
}

export async function deleteRecruitOpinion(client: HulyClient, id: string): Promise<{ deleted: true, id: string }> {
  const opinion = await getRecruitOpinionById(client, id)
  await client.removeDoc(RECRUIT_OPINION_CLASS as any, core.space.Space, opinion._id)
  return { deleted: true, id }
}
