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
}

export type MemberSummary = {
  id: string
  name: string
  role: string | null
  email: string | null
  active: boolean | null
  personUuid: string | null
}
