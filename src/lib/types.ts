export type AuthConfig =
  | {
      url: string
      workspace: string
      email: string
      password: string
      token?: undefined
    }
  | {
      url: string
      workspace: string
      token: string
      email?: undefined
      password?: undefined
    }

export type ConfigFile = Partial<{
  url: string
  workspace: string
  email: string
  password: string
  token: string
}>

export type SuccessPayload = {
  ok: true
  data: unknown
  total?: number
}

export type ErrorCode =
  | 'GENERAL_ERROR'
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONNECTION_ERROR'

export type ErrorPayload = {
  ok: false
  error: {
    code: ErrorCode
    message: string
    details?: unknown
  }
}

export type ProjectSummary = {
  id: string
  identifier: string
  name: string | null
  description: string | null
  defaultIssueStatus: string | null
}

export type IssueSummary = {
  id: string
  identifier: string
  title: string
  description: string | null
  status: string | null
  priority: string | number
  assignee: string | null
  assigneeId: string | null
  project: string | null
  dueDate: string | null
  number: number | null
  milestone: string | null
  estimation: number
  remainingTime: number
  reportedTime: number
  labels: string[]
  parentId: string | null
  parentIdentifier: string | null
  blockerIds: string[]
  blockerIdentifiers: string[]
  relationIds: string[]
  relationIdentifiers: string[]
  subIssueCount: number
  childEstimation: number
  childReportedTime: number
  templateId: string | null
  templateChildId: string | null
}

export type IssueTemplateSummary = {
  id: string
  title: string
  description: string | null
  priority: string | number
  assignee: string | null
  assigneeEmail: string | null
  assigneeId: string | null
  component: string | null
  componentId: string | null
  milestone: string | null
  milestoneId: string | null
  project: string | null
  estimation: number
  labels: string[]
  relationIds: string[]
  childCount: number
  children: Array<{
    id: string
    title: string
    priority: string | number
    estimation: number
    milestoneId: string | null
    componentId: string | null
    assigneeId: string | null
    labelIds: string[]
  }>
  createdOn: string | null
  modifiedOn: string | null
}

export type MemberSummary = {
  id: string
  name: string
  role: string | null
  email: string | null
  active: boolean | null
  personUuid: string | null
}

export type TeamspaceSummary = {
  id: string
  name: string
  description: string | null
  private: boolean
  archived: boolean
  type: string | null
}

export type DocumentSummary = {
  id: string
  title: string
  content: string | null
  teamspace: string | null
  parentId: string | null
  rank: string | null
}

export type ChannelSummary = {
  type: string
  value: string
}

export type PersonSummary = {
  id: string
  name: string
  city: string | null
  channels: ChannelSummary[]
}

export type MilestoneSummary = {
  id: string
  label: string
  status: string
  project: string | null
  targetDate: string | null
}

export type LabelSummary = {
  id: string
  title: string
  color: number
  description: string | null
}

export type ComponentSummary = {
  id: string
  label: string
  description: string | null
}

export type CommentSummary = {
  id: string
  message: string
  author: string
  createdOn: string | null
}

export type NotificationSummary = {
  id: string
  class: string
  title: string | null
  body: string | null
  isViewed: boolean
  archived: boolean
  objectId: string
  objectClass: string
  attachedTo: string | null
  attachedToClass: string | null
  contextId: string
  types: string[]
  createdOn: string | null
  modifiedOn: string | null
  intlParams: Record<string, string | number> | null
  intlParamsNotLocalized: Record<string, string> | null
}

export type TimeTodoSummary = {
  id: string
  class: string
  title: string
  description: string | null
  priority: string | number
  isDone: boolean
  doneOn: string | null
  dueDate: string | null
  issue: string | null
  issueId: string | null
  assignee: string | null
  assigneeEmail: string | null
  assigneeId: string | null
  createdOn: string | null
  modifiedOn: string | null
}

export type TimeReportSummary = {
  id: string
  class: string
  issue: string | null
  issueId: string | null
  employee: string | null
  employeeEmail: string | null
  employeeId: string | null
  date: string | null
  value: number
  description: string
  createdOn: string | null
  modifiedOn: string | null
}

export type TimeReportTotalsSummary = {
  reportCount: number
  totalValue: number
  filters: {
    issue: string | null
    assignee: string | null
    description: string | null
    valueFrom: number | null
    valueTo: number | null
    dateFrom: string | null
    dateTo: string | null
  }
  byIssue: Array<{
    issue: string | null
    issueId: string | null
    reportCount: number
    totalValue: number
  }>
  byDate: Array<{
    date: string | null
    reportCount: number
    totalValue: number
  }>
  byEmployee: Array<{
    employee: string | null
    employeeEmail: string | null
    employeeId: string | null
    reportCount: number
    totalValue: number
  }>
}

export type CardTypeSummary = {
  id: string
  label: string
  builtin: boolean
  inDefaultSpace: boolean
  extendsId: string | null
  extendsLabel: string | null
  color: number | null
  background: number | null
  removed: boolean | null
  createdOn: string | null
  modifiedOn: string | null
}

export type CardRoleSummary = {
  id: string
  name: string
  typeId: string
  typeLabel: string
  createdOn: string | null
  modifiedOn: string | null
}

export type CardSummary = {
  id: string
  title: string
  content: string | null
  type: string
  typeId: string
  space: string
  parentId: string | null
  parentTitle: string | null
  children: number | null
  attachments: number | null
  readonly: boolean | null
  rank: string | null
  createdOn: string | null
  modifiedOn: string | null
}

export type ChatSpaceSummary = {
  id: string
  kind: 'channel' | 'direct'
  name: string | null
  description: string | null
  topic: string | null
  private: boolean
  archived: boolean
  autoJoin: boolean | null
  members: string[]
  memberCount: number
  messageCount: number | null
  createdOn: string | null
  modifiedOn: string | null
}

export type ChatMemberSummary = {
  accountUuid: string
  memberId: string | null
  name: string | null
  email: string | null
}

export type ChatMessageSummary = {
  id: string
  chatId: string
  chatKind: 'channel' | 'direct'
  chatName: string | null
  message: string
  author: string
  authorId: string
  createdOn: string | null
  modifiedOn: string | null
  editedOn: string | null
}

export type ChatThreadSummary = {
  id: string
  parentMessageId: string
  chatId: string
  chatKind: 'channel' | 'direct'
  chatName: string | null
  message: string
  author: string
  authorId: string
  createdOn: string | null
  modifiedOn: string | null
  editedOn: string | null
}

export type BoardSummary = {
  id: string
  name: string
  description: string | null
  color: number | null
  background: string | null
  private: boolean
  archived: boolean
  type: string | null
  createdOn: string | null
  modifiedOn: string | null
}

export type BoardCardSummary = {
  id: string
  boardId: string
  boardName: string | null
  title: string
  description: string | null
  coverColor: number | null
  coverSize: 'small' | 'large' | null
  memberIds: string[]
  memberNames: string[]
  status: string | null
  statusName: string | null
  statusCategoryId: string | null
  statusCategory: string | null
  number: number | null
  rank: string | null
  assigneeId: string | null
  assigneeName: string | null
  startDate: string | null
  dueDate: string | null
  location: string | null
  archived: boolean
  createdOn: string | null
  modifiedOn: string | null
}

export type BoardColumnSummary = {
  boardId: string | null
  boardName: string | null
  status: string | null
  statusName: string | null
  statusCategoryId: string | null
  statusCategory: string | null
  cardCount: number
}

export type BoardColumnDetailSummary = BoardColumnSummary & {
  cards: BoardCardSummary[]
}

export type DriveSummary = {
  id: string
  name: string
  description: string | null
  private: boolean
  archived: boolean
  type: string | null
  createdOn: string | null
  modifiedOn: string | null
}

export type DriveResourceSummary = {
  id: string
  class: 'folder' | 'file'
  title: string | null
  name: string | null
  docUpdateMessages: number | null
  createdOn: string | null
  modifiedOn: string | null
}

export type DriveActivitySummary = {
  id: string
  action: 'create' | 'update' | 'remove' | string
  attachedTo: string | null
  attachedToClass: string | null
  objectId: string | null
  objectClass: string | null
  collection: string | null
  txId: string | null
  createdOn: string | null
  modifiedOn: string | null
  modifiedBy: string | null
}

export type HrDepartmentSummary = {
  id: string
  name: string
  description: string | null
  parentId: string | null
  parentName: string | null
  teamLeadId: string | null
  teamLeadName: string | null
  memberIds: string[]
  managerIds: string[]
  createdOn: string | null
  modifiedOn: string | null
}

export type HrEmployeeSummary = {
  id: string
  name: string
  email: string | null
  departmentId: string | null
  departmentName: string | null
  active: boolean | null
  role: string | null
  personUuid: string | null
}

export type HrRequestTypeSummary = {
  id: string
  label: string
  value: number | null
  color: number | null
}

export type HrRequestSummary = {
  id: string
  employeeId: string | null
  employeeName: string | null
  departmentId: string | null
  departmentName: string | null
  typeId: string | null
  typeLabel: string | null
  description: string | null
  date: string | null
  dueDate: string | null
  createdOn: string | null
  modifiedOn: string | null
}

export type HrPublicHolidaySummary = {
  id: string
  title: string
  description: string | null
  date: string | null
  departmentId: string | null
  departmentName: string | null
  createdOn: string | null
  modifiedOn: string | null
}

export type RecruitVacancySummary = {
  id: string
  name: string
  description: string | null
  fullDescription: string | null
  location: string | null
  dueDate: string | null
  private: boolean
  archived: boolean
  type: string | null
  applicantCount: number
  createdOn: string | null
  modifiedOn: string | null
}

export type RecruitApplicantSummary = {
  id: string
  vacancyId: string | null
  vacancyName: string | null
  identifier: string | null
  number: number | null
  rank: string | null
  statusId: string | null
  status: string | null
  assigneeId: string | null
  assigneeName: string | null
  startDate: string | null
  dueDate: string | null
  createdOn: string | null
  modifiedOn: string | null
}

export type RecruitApplicantStatusSummary = {
  id: string
  name: string
  color: number | null
}

export type RecruitCandidateSummary = {
  id: string
  name: string
  city: string | null
  title: string | null
  source: string | null
  remote: boolean | null
  onsite: boolean | null
  applications: number | null
  reviews: number | null
  createdOn: string | null
  modifiedOn: string | null
}

export type RecruitReviewSummary = {
  id: string
  candidateId: string | null
  candidateName: string | null
  title: string
  description: string | null
  verdict: string | null
  applicantId: string | null
  location: string | null
  date: string | null
  dueDate: string | null
  allDay: boolean
  opinionCount: number | null
  createdOn: string | null
  modifiedOn: string | null
}

export type RecruitOpinionSummary = {
  id: string
  reviewId: string | null
  reviewTitle: string | null
  value: string | null
  description: string | null
  number: number | null
  createdOn: string | null
  modifiedOn: string | null
}
