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
  labels: string[]
  parentId: string | null
  parentIdentifier: string | null
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
