import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { readTextOption } from '../lib/files'
import {
  createRecruitApplicant,
  createRecruitCandidate,
  createRecruitOpinion,
  createRecruitReview,
  createRecruitVacancy,
  deleteRecruitApplicant,
  deleteRecruitCandidate,
  deleteRecruitOpinion,
  deleteRecruitReview,
  deleteRecruitVacancy,
  getRecruitApplicantSummary,
  getRecruitCandidateSummary,
  getRecruitOpinionSummary,
  getRecruitReviewSummary,
  getRecruitVacancySummary,
  listRecruitApplicantStatuses,
  listRecruitApplicants,
  listRecruitCandidates,
  listRecruitOpinions,
  listRecruitReviews,
  listRecruitVacancies,
  moveRecruitApplicant,
  updateRecruitApplicant,
  updateRecruitCandidate,
  updateRecruitOpinion,
  updateRecruitReview,
  updateRecruitVacancy
} from '../lib/huly'
import { resolveNullableStringOption } from '../lib/options'
import { CliError } from '../lib/output'

type RecruitVacancyCreateOptions = {
  name: string
  description?: string
  fullDescription?: string
  fullDescriptionFile?: string
  location?: string
  dueDate?: string
  private?: boolean
}

type RecruitVacancyUpdateOptions = {
  name?: string
  description?: string
  fullDescription?: string
  fullDescriptionFile?: string
  clearFullDescription?: boolean
  location?: string
  clearLocation?: boolean
  dueDate?: string
  clearDueDate?: boolean
  private?: boolean
  public?: boolean
  archive?: boolean
  unarchive?: boolean
}

type RecruitVacancyListOptions = {
  name?: string
  location?: string
  private?: boolean
  public?: boolean
  archived?: boolean
  active?: boolean
  limit?: string
}

type RecruitApplicantListOptions = {
  vacancy?: string
  identifier?: string
  status?: string
  assignee?: string
  withoutAssignee?: boolean
  limit?: string
}

type RecruitApplicantCreateOptions = {
  vacancy: string
  identifier: string
  status?: string
  assignee?: string
  startDate?: string
  dueDate?: string
}

type RecruitApplicantUpdateOptions = {
  identifier?: string
  status?: string
  assignee?: string | false
  startDate?: string | false
  dueDate?: string | false
}

type RecruitApplicantMoveOptions = {
  before?: string
  after?: string
  top?: boolean
  bottom?: boolean
  status?: string
}

type RecruitCandidateCreateOptions = {
  name: string
  city?: string
  title?: string
  source?: string
  remote?: boolean
  onsite?: boolean
}

type RecruitCandidateListOptions = {
  name?: string
  city?: string
  title?: string
  source?: string
  remote?: boolean
  onsite?: boolean
  limit?: string
}

type RecruitCandidateUpdateOptions = {
  name?: string
  city?: string
  clearCity?: boolean
  title?: string
  clearTitle?: boolean
  source?: string
  clearSource?: boolean
  remote?: boolean
  onsite?: boolean
}

type RecruitReviewListOptions = {
  candidate?: string
  applicant?: string
  verdict?: string
  location?: string
  limit?: string
}

type RecruitReviewCreateOptions = {
  candidate: string
  title: string
  verdict: string
  description?: string
  descriptionFile?: string
  location?: string
  date: string
  dueDate?: string
  applicant?: string
}

type RecruitReviewUpdateOptions = {
  title?: string
  verdict?: string
  description?: string
  descriptionFile?: string
  clearDescription?: boolean
  location?: string | false
  date?: string
  dueDate?: string
  applicant?: string | false
}

type RecruitOpinionListOptions = {
  review?: string
  value?: string
  limit?: string
}

type RecruitOpinionCreateOptions = {
  review: string
  value: string
  description?: string
  descriptionFile?: string
}

type RecruitOpinionUpdateOptions = {
  value?: string
  description?: string
  descriptionFile?: string
  clearDescription?: boolean
}

function resolvePrivate(options: Pick<RecruitVacancyUpdateOptions, 'private' | 'public'>): boolean | undefined {
  if (options.private && options.public) {
    throw new CliError('VALIDATION_ERROR', 'Use only one of --private or --public.', 4)
  }

  if (options.private) {
    return true
  }

  if (options.public) {
    return false
  }

  return undefined
}

function resolveArchived(options: Pick<RecruitVacancyUpdateOptions, 'archive' | 'unarchive'>): boolean | undefined {
  if (options.archive && options.unarchive) {
    throw new CliError('VALIDATION_ERROR', 'Use only one of --archive or --unarchive.', 4)
  }

  if (options.archive) {
    return true
  }

  if (options.unarchive) {
    return false
  }

  return undefined
}

function resolveArchivedFilter(options: { archived?: boolean, active?: boolean }): boolean | undefined {
  if (options.archived && options.active) {
    throw new CliError('VALIDATION_ERROR', 'Use only one of --archived or --active.', 4)
  }

  if (options.archived) {
    return true
  }

  if (options.active) {
    return false
  }

  return undefined
}

function parseIsoDate(value: string | undefined, flagName: string): string | undefined {
  if (value === undefined) {
    return undefined
  }

  if (Number.isNaN(new Date(value).getTime())) {
    throw new CliError('VALIDATION_ERROR', 'Invalid ' + flagName + ' value: ' + value, 4)
  }

  return value
}

function parseLimit(limit: string | undefined): number | undefined {
  if (limit === undefined) {
    return undefined
  }

  const parsed = Number(limit)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliError('VALIDATION_ERROR', 'Invalid --limit value: ' + limit, 4)
  }

  return parsed
}

function resolveApplicantAssigneeFilter(options: RecruitApplicantListOptions): string | null | undefined {
  return resolveNullableStringOption(options.assignee, options.withoutAssignee, 'assignee', 'without-assignee')
}

function resolveRecruitApplicantMove(options: RecruitApplicantMoveOptions): { beforeId?: string, afterId?: string, top?: boolean, bottom?: boolean } {
  const selected = [options.before !== undefined, options.after !== undefined, options.top === true, options.bottom === true]
    .filter(Boolean)
    .length

  if (selected !== 1) {
    throw new CliError('VALIDATION_ERROR', 'Provide exactly one of --before, --after, --top, or --bottom.', 4)
  }

  return {
    beforeId: options.before,
    afterId: options.after,
    top: options.top ? true : undefined,
    bottom: options.bottom ? true : undefined
  }
}

export function registerRecruitCommands(program: Command): void {
  const recruit = program.command('recruit').description('Recruiting commands')

  const vacancy = recruit.command('vacancy').description('Vacancy commands')

  const vacancyList = vacancy
    .command('list')
    .description('List vacancies')
    .option('--name <text>', 'Filter by exact vacancy name')
    .option('--location <text>', 'Filter by exact vacancy location')
    .option('--private', 'Filter to private vacancies')
    .option('--public', 'Filter to public vacancies')
    .option('--archived', 'Filter to archived vacancies')
    .option('--active', 'Filter to active vacancies')
    .option('--limit <n>', 'Maximum number of vacancies')

  handleCommand(vacancyList, async (options: RecruitVacancyListOptions) => {
    return await withClient(async (client) => await listRecruitVacancies(client, {
      name: options.name,
      location: options.location,
      private: resolvePrivate(options),
      archived: resolveArchivedFilter(options),
      limit: parseLimit(options.limit)
    }))
  })

  const vacancyGet = vacancy
    .command('get')
    .description('Get one vacancy by id')
    .argument('<id>', 'Vacancy id')

  handleCommand(vacancyGet, async (id: string) => await withClient(async (client) => await getRecruitVacancySummary(client, id)))

  const vacancyCreate = vacancy
    .command('create')
    .description('Create a vacancy')
    .requiredOption('--name <name>', 'Vacancy name')
    .option('--description <text>', 'Vacancy description')
    .option('--full-description <markdown>', 'Vacancy full description markdown')
    .option('--full-description-file <path>', 'Read vacancy full description markdown from a file')
    .option('--location <text>', 'Vacancy location')
    .option('--due-date <date>', 'Vacancy due date in ISO-8601 format')
    .option('--private', 'Create the vacancy as private')

  handleCommand(vacancyCreate, async (options: RecruitVacancyCreateOptions) => {
    const fullDescription = await readTextOption(options.fullDescription, options.fullDescriptionFile, 'full-description')

    return await withClient(async (client) => await createRecruitVacancy(client, {
      name: options.name,
      description: options.description,
      fullDescription,
      location: options.location,
      dueDate: parseIsoDate(options.dueDate, '--due-date'),
      private: options.private
    }))
  })

  const vacancyUpdate = vacancy
    .command('update')
    .description('Update a vacancy')
    .argument('<id>', 'Vacancy id')
    .option('--name <name>', 'Vacancy name')
    .option('--description <text>', 'Vacancy description')
    .option('--full-description <markdown>', 'Vacancy full description markdown')
    .option('--full-description-file <path>', 'Read vacancy full description markdown from a file')
    .option('--clear-full-description', 'Remove the vacancy full description')
    .option('--location <text>', 'Vacancy location')
    .option('--clear-location', 'Remove the vacancy location')
    .option('--due-date <date>', 'Vacancy due date in ISO-8601 format')
    .option('--clear-due-date', 'Remove the vacancy due date')
    .option('--private', 'Set the vacancy to private')
    .option('--public', 'Set the vacancy to public')
    .option('--archive', 'Archive the vacancy')
    .option('--unarchive', 'Unarchive the vacancy')

  handleCommand(vacancyUpdate, async (id: string, options: RecruitVacancyUpdateOptions) => {
    const fullDescription = await readTextOption(options.fullDescription, options.fullDescriptionFile, 'full-description')

    return await withClient(async (client) => await updateRecruitVacancy(client, id, {
      name: options.name,
      description: options.description,
      fullDescription: resolveNullableStringOption(fullDescription, options.clearFullDescription, 'full-description', 'clear-full-description'),
      location: resolveNullableStringOption(options.location, options.clearLocation, 'location', 'clear-location'),
      dueDate: resolveNullableStringOption(
        parseIsoDate(options.dueDate, '--due-date'),
        options.clearDueDate,
        'due-date',
        'clear-due-date'
      ),
      private: resolvePrivate(options),
      archived: resolveArchived(options)
    }))
  })

  const vacancyDelete = vacancy
    .command('delete')
    .description('Delete a vacancy')
    .argument('<id>', 'Vacancy id')

  handleCommand(vacancyDelete, async (id: string) => await withClient(async (client) => await deleteRecruitVacancy(client, id)))

  const applicantStatus = recruit.command('applicant-status').description('Recruit applicant status commands')

  const applicantStatusList = applicantStatus
    .command('list')
    .description('List recruit applicant statuses')

  handleCommand(applicantStatusList, async () => await withClient(async (client) => await listRecruitApplicantStatuses(client)))

  const applicant = recruit.command('applicant').description('Applicant commands')

  const applicantList = applicant
    .command('list')
    .description('List applicants')
    .option('--vacancy <id>', 'Filter by vacancy id')
    .option('--identifier <text>', 'Filter by exact applicant identifier')
    .option('--status <status>', 'Filter by applicant status name or id')
    .option('--assignee <id>', 'Filter by assignee person id')
    .option('--without-assignee', 'Filter to applicants without an assignee')
    .option('--limit <n>', 'Maximum number of applicants')

  handleCommand(applicantList, async (options: RecruitApplicantListOptions) => {
    return await withClient(async (client) => await listRecruitApplicants(client, {
      vacancyId: options.vacancy,
      identifier: options.identifier,
      status: options.status,
      assigneeId: resolveApplicantAssigneeFilter(options),
      limit: parseLimit(options.limit)
    }))
  })

  const applicantGet = applicant
    .command('get')
    .description('Get one applicant by id')
    .argument('<id>', 'Applicant id')

  handleCommand(applicantGet, async (id: string) => await withClient(async (client) => await getRecruitApplicantSummary(client, id)))

  const applicantCreate = applicant
    .command('create')
    .description('Create an applicant on a vacancy')
    .requiredOption('--vacancy <id>', 'Vacancy id')
    .requiredOption('--identifier <text>', 'Applicant identifier')
    .option('--status <status>', 'Applicant status name')
    .option('--assignee <id>', 'Assignee person id')
    .option('--start-date <date>', 'Start date in ISO-8601 format')
    .option('--due-date <date>', 'Due date in ISO-8601 format')

  handleCommand(applicantCreate, async (options: RecruitApplicantCreateOptions) => {
    return await withClient(async (client) => await createRecruitApplicant(client, {
      vacancyId: options.vacancy,
      identifier: options.identifier,
      status: options.status,
      assigneeId: options.assignee,
      startDate: parseIsoDate(options.startDate, '--start-date'),
      dueDate: parseIsoDate(options.dueDate, '--due-date')
    }))
  })

  const applicantUpdate = applicant
    .command('update')
    .description('Update an applicant')
    .argument('<id>', 'Applicant id')
    .option('--identifier <text>', 'Applicant identifier')
    .option('--status <status>', 'Applicant status name')
    .option('--assignee <id>', 'Assignee person id')
    .option('--no-assignee', 'Remove the assignee')
    .option('--start-date <date>', 'Start date in ISO-8601 format')
    .option('--no-start-date', 'Remove the start date')
    .option('--due-date <date>', 'Due date in ISO-8601 format')
    .option('--no-due-date', 'Remove the due date')

  handleCommand(applicantUpdate, async (id: string, options: RecruitApplicantUpdateOptions) => {
    return await withClient(async (client) => await updateRecruitApplicant(client, id, {
      identifier: options.identifier,
      status: options.status,
      assigneeId: resolveNullableStringOption(options.assignee, undefined, 'assignee'),
      startDate: resolveNullableStringOption(
        options.startDate === false ? false : parseIsoDate(options.startDate, '--start-date'),
        undefined,
        'start-date'
      ),
      dueDate: resolveNullableStringOption(
        options.dueDate === false ? false : parseIsoDate(options.dueDate, '--due-date'),
        undefined,
        'due-date'
      )
    }))
  })

  const applicantDelete = applicant
    .command('delete')
    .description('Delete an applicant')
    .argument('<id>', 'Applicant id')

  handleCommand(applicantDelete, async (id: string) => await withClient(async (client) => await deleteRecruitApplicant(client, id)))

  const applicantMove = applicant
    .command('move')
    .description('Move an applicant within vacancy order')
    .argument('<id>', 'Applicant id')
    .option('--before <id>', 'Move before another applicant id')
    .option('--after <id>', 'Move after another applicant id')
    .option('--top', 'Move to the top of the vacancy order')
    .option('--bottom', 'Move to the bottom of the vacancy order')
    .option('--status <status>', 'Set the applicant status while moving')

  handleCommand(applicantMove, async (id: string, options: RecruitApplicantMoveOptions) => {
    return await withClient(async (client) => await moveRecruitApplicant(client, id, {
      ...resolveRecruitApplicantMove(options),
      status: options.status
    }))
  })

  const candidate = recruit.command('candidate').description('Candidate commands')

  const candidateList = candidate
    .command('list')
    .description('List candidates')
    .option('--name <text>', 'Filter by exact candidate name')
    .option('--city <text>', 'Filter by exact candidate city')
    .option('--title <text>', 'Filter by exact candidate title')
    .option('--source <text>', 'Filter by exact candidate source')
    .option('--remote', 'Filter to remote candidates')
    .option('--onsite', 'Filter to onsite candidates')
    .option('--limit <n>', 'Maximum number of candidates')

  handleCommand(candidateList, async (options: RecruitCandidateListOptions) => {
    return await withClient(async (client) => await listRecruitCandidates(client, {
      name: options.name,
      city: options.city,
      title: options.title,
      source: options.source,
      remote: options.remote ? true : undefined,
      onsite: options.onsite ? true : undefined,
      limit: parseLimit(options.limit)
    }))
  })

  const candidateGet = candidate
    .command('get')
    .description('Get one candidate by id')
    .argument('<id>', 'Candidate id')

  handleCommand(candidateGet, async (id: string) => await withClient(async (client) => await getRecruitCandidateSummary(client, id)))

  const candidateCreate = candidate
    .command('create')
    .description('Create a candidate')
    .requiredOption('--name <name>', 'Candidate name')
    .option('--city <city>', 'Candidate city')
    .option('--title <title>', 'Candidate title')
    .option('--source <text>', 'Candidate source')
    .option('--remote', 'Mark the candidate as remote')
    .option('--onsite', 'Mark the candidate as onsite')

  handleCommand(candidateCreate, async (options: RecruitCandidateCreateOptions) => {
    return await withClient(async (client) => await createRecruitCandidate(client, options))
  })

  const candidateUpdate = candidate
    .command('update')
    .description('Update a candidate')
    .argument('<id>', 'Candidate id')
    .option('--name <name>', 'Candidate name')
    .option('--city <city>', 'Candidate city')
    .option('--clear-city', 'Clear the candidate city')
    .option('--title <title>', 'Candidate title')
    .option('--clear-title', 'Clear the candidate title')
    .option('--source <text>', 'Candidate source')
    .option('--clear-source', 'Clear the candidate source')
    .option('--remote', 'Mark the candidate as remote')
    .option('--no-remote', 'Mark the candidate as not remote')
    .option('--onsite', 'Mark the candidate as onsite')
    .option('--no-onsite', 'Mark the candidate as not onsite')

  handleCommand(candidateUpdate, async (id: string, options: RecruitCandidateUpdateOptions) => {
    if (options.city !== undefined && options.clearCity) {
      throw new CliError('VALIDATION_ERROR', 'Use only one of --city or --clear-city.', 4)
    }

    if (options.title !== undefined && options.clearTitle) {
      throw new CliError('VALIDATION_ERROR', 'Use only one of --title or --clear-title.', 4)
    }

    if (options.source !== undefined && options.clearSource) {
      throw new CliError('VALIDATION_ERROR', 'Use only one of --source or --clear-source.', 4)
    }

    return await withClient(async (client) => await updateRecruitCandidate(client, id, {
      ...options,
      city: options.clearCity ? null : options.city,
      title: options.clearTitle ? null : options.title,
      source: options.clearSource ? null : options.source
    }))
  })

  const candidateDelete = candidate
    .command('delete')
    .description('Delete a candidate')
    .argument('<id>', 'Candidate id')

  handleCommand(candidateDelete, async (id: string) => await withClient(async (client) => await deleteRecruitCandidate(client, id)))

  const review = recruit.command('review').description('Candidate review commands')

  const reviewList = review
    .command('list')
    .description('List reviews')
    .option('--candidate <id>', 'Filter by candidate id')
    .option('--applicant <id>', 'Filter by applicant id')
    .option('--verdict <value>', 'Filter by exact review verdict')
    .option('--location <text>', 'Filter by exact review location')
    .option('--limit <n>', 'Maximum number of reviews')

  handleCommand(reviewList, async (options: RecruitReviewListOptions) => {
    return await withClient(async (client) => await listRecruitReviews(client, {
      candidateId: options.candidate,
      applicantId: options.applicant,
      verdict: options.verdict,
      location: options.location,
      limit: parseLimit(options.limit)
    }))
  })

  const reviewGet = review
    .command('get')
    .description('Get one review by id')
    .argument('<id>', 'Review id')

  handleCommand(reviewGet, async (id: string) => await withClient(async (client) => await getRecruitReviewSummary(client, id)))

  const reviewCreate = review
    .command('create')
    .description('Create a review for a candidate')
    .requiredOption('--candidate <id>', 'Candidate id')
    .requiredOption('--title <title>', 'Review title')
    .requiredOption('--verdict <value>', 'Review verdict')
    .requiredOption('--date <date>', 'Review start date in ISO-8601 format')
    .option('--due-date <date>', 'Review end date in ISO-8601 format')
    .option('--description <markdown>', 'Review description markdown')
    .option('--description-file <path>', 'Read review description markdown from a file')
    .option('--location <text>', 'Review location')
    .option('--applicant <id>', 'Applicant id to attach to the review')

  handleCommand(reviewCreate, async (options: RecruitReviewCreateOptions) => {
    const description = await readTextOption(options.description, options.descriptionFile, 'description')

    return await withClient(async (client) => await createRecruitReview(client, {
      candidateId: options.candidate,
      title: options.title,
      verdict: options.verdict,
      description,
      location: options.location,
      date: parseIsoDate(options.date, '--date')!,
      dueDate: parseIsoDate(options.dueDate, '--due-date'),
      applicantId: options.applicant
    }))
  })

  const reviewUpdate = review
    .command('update')
    .description('Update a review')
    .argument('<id>', 'Review id')
    .option('--title <title>', 'Review title')
    .option('--verdict <value>', 'Review verdict')
    .option('--description <markdown>', 'Review description markdown')
    .option('--description-file <path>', 'Read review description markdown from a file')
    .option('--clear-description', 'Remove the review description')
    .option('--location <text>', 'Review location')
    .option('--no-location', 'Remove the review location')
    .option('--date <date>', 'Review start date in ISO-8601 format')
    .option('--due-date <date>', 'Review end date in ISO-8601 format')
    .option('--applicant <id>', 'Applicant id to attach to the review')
    .option('--no-applicant', 'Remove the applicant attachment')

  handleCommand(reviewUpdate, async (id: string, options: RecruitReviewUpdateOptions) => {
    if (options.clearDescription && (options.description !== undefined || options.descriptionFile !== undefined)) {
      throw new CliError('VALIDATION_ERROR', 'Use only one of --description/--description-file or --clear-description.', 4)
    }

    const description = options.clearDescription
      ? ''
      : await readTextOption(options.description, options.descriptionFile, 'description')

    return await withClient(async (client) => await updateRecruitReview(client, id, {
      title: options.title,
      verdict: options.verdict,
      description,
      location: resolveNullableStringOption(options.location, undefined, 'location'),
      date: parseIsoDate(options.date, '--date'),
      dueDate: parseIsoDate(options.dueDate, '--due-date'),
      applicantId: resolveNullableStringOption(options.applicant, undefined, 'applicant')
    }))
  })

  const reviewDelete = review
    .command('delete')
    .description('Delete a review')
    .argument('<id>', 'Review id')

  handleCommand(reviewDelete, async (id: string) => await withClient(async (client) => await deleteRecruitReview(client, id)))

  const opinion = recruit.command('opinion').description('Review opinion commands')

  const opinionList = opinion
    .command('list')
    .description('List opinions')
    .option('--review <id>', 'Filter by review id')
    .option('--value <value>', 'Filter by exact opinion value')
    .option('--limit <n>', 'Maximum number of opinions')

  handleCommand(opinionList, async (options: RecruitOpinionListOptions) => {
    return await withClient(async (client) => await listRecruitOpinions(client, {
      reviewId: options.review,
      value: options.value,
      limit: parseLimit(options.limit)
    }))
  })

  const opinionGet = opinion
    .command('get')
    .description('Get one opinion by id')
    .argument('<id>', 'Opinion id')

  handleCommand(opinionGet, async (id: string) => await withClient(async (client) => await getRecruitOpinionSummary(client, id)))

  const opinionCreate = opinion
    .command('create')
    .description('Create an opinion on a review')
    .requiredOption('--review <id>', 'Review id')
    .requiredOption('--value <value>', 'Opinion value')
    .option('--description <markdown>', 'Opinion description markdown')
    .option('--description-file <path>', 'Read opinion description markdown from a file')

  handleCommand(opinionCreate, async (options: RecruitOpinionCreateOptions) => {
    const description = await readTextOption(options.description, options.descriptionFile, 'description')

    return await withClient(async (client) => await createRecruitOpinion(client, {
      reviewId: options.review,
      value: options.value,
      description
    }))
  })

  const opinionUpdate = opinion
    .command('update')
    .description('Update an opinion')
    .argument('<id>', 'Opinion id')
    .option('--value <value>', 'Opinion value')
    .option('--description <markdown>', 'Opinion description markdown')
    .option('--description-file <path>', 'Read opinion description markdown from a file')
    .option('--clear-description', 'Remove the opinion description')

  handleCommand(opinionUpdate, async (id: string, options: RecruitOpinionUpdateOptions) => {
    if (options.clearDescription && (options.description !== undefined || options.descriptionFile !== undefined)) {
      throw new CliError('VALIDATION_ERROR', 'Use only one of --description/--description-file or --clear-description.', 4)
    }

    const description = options.clearDescription
      ? ''
      : await readTextOption(options.description, options.descriptionFile, 'description')

    return await withClient(async (client) => await updateRecruitOpinion(client, id, {
      value: options.value,
      description
    }))
  })

  const opinionDelete = opinion
    .command('delete')
    .description('Delete an opinion')
    .argument('<id>', 'Opinion id')

  handleCommand(opinionDelete, async (id: string) => await withClient(async (client) => await deleteRecruitOpinion(client, id)))
}
