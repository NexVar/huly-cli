import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import {
  createHrDepartment,
  createHrPublicHoliday,
  createHrRequest,
  deleteHrDepartment,
  deleteHrPublicHoliday,
  deleteHrRequest,
  getHrDepartmentSummary,
  getHrEmployeeSummary,
  getHrPublicHolidaySummary,
  getHrRequestSummary,
  listHrDepartments,
  listHrEmployees,
  listHrPublicHolidays,
  listHrRequests,
  listHrRequestTypes,
  updateHrDepartment,
  updateHrPublicHoliday,
  updateHrRequest
} from '../lib/huly'
import { resolveNullableStringOption } from '../lib/options'
import { CliError } from '../lib/output'

type HrEmployeeListOptions = {
  limit?: string
}

type HrDepartmentCreateOptions = {
  name: string
  description?: string
  parent?: string
  teamLead?: string
}

type HrDepartmentUpdateOptions = {
  name?: string
  description?: string
  parent?: string | false
  teamLead?: string | false
}

type HrRequestListOptions = {
  employee?: string
  department?: string
  type?: string
  dateFrom?: string
  dateTo?: string
  dueDateFrom?: string
  dueDateTo?: string
  limit?: string
}

type HrRequestCreateOptions = {
  employee?: string
  department?: string
  type: string
  description?: string
  date: string
  dueDate?: string
}

type HrRequestUpdateOptions = {
  department?: string
  type?: string
  description?: string
  date?: string
  dueDate?: string
  clearDueDate?: boolean
}

type HrPublicHolidayListOptions = {
  department?: string
  title?: string
  dateFrom?: string
  dateTo?: string
  limit?: string
}

type HrPublicHolidayCreateOptions = {
  title: string
  description?: string
  date: string
  department?: string
}

type HrPublicHolidayUpdateOptions = {
  title?: string
  description?: string
  date?: string
  department?: string
}

function parseLimit(limit: string | undefined): number | undefined {
  if (limit === undefined) {
    return undefined
  }

  const parsed = Number(limit)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliError('VALIDATION_ERROR', `Invalid --limit value: ${limit}`, 4)
  }

  return parsed
}

function parseIsoDate(value: string | undefined, flagName: string): string | undefined {
  if (value === undefined) {
    return undefined
  }

  if (Number.isNaN(new Date(value).getTime())) {
    throw new CliError('VALIDATION_ERROR', `Invalid ${flagName} value: ${value}`, 4)
  }

  return value
}

export function registerHrCommands(program: Command): void {
  const hr = program.command('hr').description('HR commands')

  const department = hr.command('department').description('Department commands')

  const departmentList = department
    .command('list')
    .description('List departments')

  handleCommand(departmentList, async () => await withClient(async (client) => await listHrDepartments(client)))

  const departmentGet = department
    .command('get')
    .description('Get one department by id')
    .argument('<id>', 'Department id')

  handleCommand(departmentGet, async (id: string) => await withClient(async (client) => await getHrDepartmentSummary(client, id)))

  const departmentCreate = department
    .command('create')
    .description('Create a department')
    .requiredOption('--name <name>', 'Department name')
    .option('--description <text>', 'Department description')
    .option('--parent <id>', 'Parent department id')
    .option('--team-lead <id>', 'Team lead person id')

  handleCommand(departmentCreate, async (options: HrDepartmentCreateOptions) => {
    return await withClient(async (client) => await createHrDepartment(client, {
      name: options.name,
      description: options.description,
      parent: options.parent,
      teamLead: options.teamLead
    }))
  })

  const departmentUpdate = department
    .command('update')
    .description('Update a department')
    .argument('<id>', 'Department id')
    .option('--name <name>', 'Department name')
    .option('--description <text>', 'Department description')
    .option('--parent <id>', 'Parent department id')
    .option('--no-parent', 'Remove the parent department')
    .option('--team-lead <id>', 'Team lead person id')
    .option('--no-team-lead', 'Remove the team lead')

  handleCommand(departmentUpdate, async (id: string, options: HrDepartmentUpdateOptions) => {
    return await withClient(async (client) => await updateHrDepartment(client, id, {
      name: options.name,
      description: options.description,
      parent: resolveNullableStringOption(options.parent, undefined, 'parent'),
      teamLead: resolveNullableStringOption(options.teamLead, undefined, 'team-lead')
    }))
  })

  const departmentDelete = department
    .command('delete')
    .description('Delete a department')
    .argument('<id>', 'Department id')

  handleCommand(departmentDelete, async (id: string) => await withClient(async (client) => await deleteHrDepartment(client, id)))

  const employee = hr.command('employee').description('Employee commands')

  const employeeList = employee
    .command('list')
    .description('List employees')
    .option('--limit <n>', 'Maximum number of employees')

  handleCommand(employeeList, async (options: HrEmployeeListOptions) => {
    return await withClient(async (client) => await listHrEmployees(client, parseLimit(options.limit)))
  })

  const employeeGet = employee
    .command('get')
    .description('Get one employee by id')
    .argument('<id>', 'Employee id')

  handleCommand(employeeGet, async (id: string) => await withClient(async (client) => await getHrEmployeeSummary(client, id)))

  const requestType = hr.command('request-type').description('HR request type commands')

  const requestTypeList = requestType
    .command('list')
    .description('List HR request types')

  handleCommand(requestTypeList, async () => await withClient(async (client) => await listHrRequestTypes(client)))

  const publicHoliday = hr.command('public-holiday').description('HR public holiday commands')

  const publicHolidayList = publicHoliday
    .command('list')
    .description('List HR public holidays')
    .option('--department <id>', 'Filter by department id')
    .option('--title <text>', 'Filter by exact public holiday title')
    .option('--date-from <date>', 'Only include public holidays on or after this ISO-8601 date')
    .option('--date-to <date>', 'Only include public holidays on or before this ISO-8601 date')
    .option('--limit <n>', 'Maximum number of public holidays')

  handleCommand(publicHolidayList, async (options: HrPublicHolidayListOptions) => {
    return await withClient(async (client) => await listHrPublicHolidays(client, {
      departmentId: options.department,
      title: options.title,
      dateFrom: parseIsoDate(options.dateFrom, '--date-from'),
      dateTo: parseIsoDate(options.dateTo, '--date-to'),
      limit: parseLimit(options.limit)
    }))
  })

  const publicHolidayGet = publicHoliday
    .command('get')
    .description('Get one HR public holiday by id')
    .argument('<id>', 'Public holiday id')

  handleCommand(publicHolidayGet, async (id: string) => await withClient(async (client) => await getHrPublicHolidaySummary(client, id)))

  const publicHolidayCreate = publicHoliday
    .command('create')
    .description('Create an HR public holiday')
    .requiredOption('--title <title>', 'Public holiday title')
    .requiredOption('--date <date>', 'Public holiday date in ISO-8601 format')
    .option('--description <text>', 'Public holiday description')
    .option('--department <id>', 'Department id; defaults to the root HR department')

  handleCommand(publicHolidayCreate, async (options: HrPublicHolidayCreateOptions) => {
    return await withClient(async (client) => await createHrPublicHoliday(client, {
      title: options.title,
      description: options.description,
      date: parseIsoDate(options.date, '--date') as string,
      departmentId: options.department
    }))
  })

  const publicHolidayUpdate = publicHoliday
    .command('update')
    .description('Update an HR public holiday')
    .argument('<id>', 'Public holiday id')
    .option('--title <title>', 'Public holiday title')
    .option('--description <text>', 'Public holiday description')
    .option('--date <date>', 'Public holiday date in ISO-8601 format')
    .option('--department <id>', 'Department id')

  handleCommand(publicHolidayUpdate, async (id: string, options: HrPublicHolidayUpdateOptions) => {
    return await withClient(async (client) => await updateHrPublicHoliday(client, id, {
      title: options.title,
      description: options.description,
      date: parseIsoDate(options.date, '--date'),
      departmentId: options.department
    }))
  })

  const publicHolidayDelete = publicHoliday
    .command('delete')
    .description('Delete an HR public holiday')
    .argument('<id>', 'Public holiday id')

  handleCommand(publicHolidayDelete, async (id: string) => await withClient(async (client) => await deleteHrPublicHoliday(client, id)))

  const request = hr.command('request').description('HR request commands')

  const requestList = request
    .command('list')
    .description('List HR requests')
    .option('--employee <id>', 'Filter by employee id')
    .option('--department <id>', 'Filter by department id')
    .option('--type <id>', 'Filter by request type id')
    .option('--date-from <date>', 'Only include requests on or after this ISO-8601 date')
    .option('--date-to <date>', 'Only include requests on or before this ISO-8601 date')
    .option('--due-date-from <date>', 'Only include requests with due dates on or after this ISO-8601 date')
    .option('--due-date-to <date>', 'Only include requests with due dates on or before this ISO-8601 date')
    .option('--limit <n>', 'Maximum number of requests')

  handleCommand(requestList, async (options: HrRequestListOptions) => {
    return await withClient(async (client) => await listHrRequests(client, {
      employeeId: options.employee,
      departmentId: options.department,
      typeId: options.type,
      dateFrom: parseIsoDate(options.dateFrom, '--date-from'),
      dateTo: parseIsoDate(options.dateTo, '--date-to'),
      dueDateFrom: parseIsoDate(options.dueDateFrom, '--due-date-from'),
      dueDateTo: parseIsoDate(options.dueDateTo, '--due-date-to'),
      limit: parseLimit(options.limit)
    }))
  })

  const requestGet = request
    .command('get')
    .description('Get one HR request by id')
    .argument('<id>', 'Request id')

  handleCommand(requestGet, async (id: string) => await withClient(async (client) => await getHrRequestSummary(client, id)))

  const requestCreate = request
    .command('create')
    .description('Create an HR request')
    .requiredOption('--type <id>', 'Request type id')
    .requiredOption('--date <date>', 'Request date in ISO-8601 format')
    .option('--employee <id>', 'Employee id; defaults to the current member')
    .option('--department <id>', 'Department id')
    .option('--description <text>', 'Request description')
    .option('--due-date <date>', 'Due date in ISO-8601 format')

  handleCommand(requestCreate, async (options: HrRequestCreateOptions) => {
    return await withClient(async (client) => await createHrRequest(client, {
      employeeId: options.employee,
      departmentId: options.department,
      typeId: options.type,
      description: options.description,
      date: parseIsoDate(options.date, '--date') as string,
      dueDate: parseIsoDate(options.dueDate, '--due-date')
    }))
  })

  const requestUpdate = request
    .command('update')
    .description('Update an HR request')
    .argument('<id>', 'Request id')
    .option('--department <id>', 'Department id')
    .option('--type <id>', 'Request type id')
    .option('--description <text>', 'Request description')
    .option('--date <date>', 'Request date in ISO-8601 format')
    .option('--due-date <date>', 'Due date in ISO-8601 format')
    .option('--clear-due-date', 'Remove the due date')

  handleCommand(requestUpdate, async (id: string, options: HrRequestUpdateOptions) => {
    return await withClient(async (client) => await updateHrRequest(client, id, {
      departmentId: options.department,
      typeId: options.type,
      description: options.description,
      date: parseIsoDate(options.date, '--date'),
      dueDate: resolveNullableStringOption(
        parseIsoDate(options.dueDate, '--due-date'),
        options.clearDueDate,
        'due-date',
        'clear-due-date'
      )
    }))
  })

  const requestDelete = request
    .command('delete')
    .description('Delete an HR request')
    .argument('<id>', 'Request id')

  handleCommand(requestDelete, async (id: string) => await withClient(async (client) => await deleteHrRequest(client, id)))
}
