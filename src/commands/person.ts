import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { createPerson, deletePerson, getPersonSummary, listPersons, updatePerson } from '../lib/huly'
import { CliError } from '../lib/output'

type PersonListOptions = {
  name?: string
  city?: string
  email?: string
  limit?: string
}

type PersonCreateOptions = {
  name: string
  city?: string
  email?: string
}

type PersonUpdateOptions = {
  name?: string
  city?: string
  clearCity?: boolean
  email?: string
  clearEmail?: boolean
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

export function registerPersonCommands(program: Command): void {
  const person = program.command('person').description('Person and contact commands')

  const list = person
    .command('list')
    .description('List persons with contact channels')
    .option('--name <text>', 'Filter by exact person name')
    .option('--city <text>', 'Filter by exact person city')
    .option('--email <email>', 'Filter by exact email address')
    .option('--limit <n>', 'Maximum number of persons')

  handleCommand(list, async (options: PersonListOptions) => {
    return await withClient(async (client) => await listPersons(client, {
      name: options.name,
      city: options.city,
      email: options.email,
      limit: parseLimit(options.limit)
    }))
  })

  const get = person
    .command('get')
    .description('Get one person by id')
    .argument('<id>', 'Person id')

  handleCommand(get, async (id: string) => await withClient(async (client) => await getPersonSummary(client, id)))

  const create = person
    .command('create')
    .description('Create a new person')
    .requiredOption('--name <name>', 'Person name')
    .option('--city <city>', 'City')
    .option('--email <email>', 'Email address')

  handleCommand(create, async (options: PersonCreateOptions) => {
    return await withClient(async (client) => await createPerson(client, {
      name: options.name,
      city: options.city,
      email: options.email
    }))
  })

  const update = person
    .command('update')
    .description('Update a person')
    .argument('<id>', 'Person id')
    .option('--name <name>', 'Person name')
    .option('--city <city>', 'City')
    .option('--clear-city', 'Clear the city')
    .option('--email <email>', 'Email address')
    .option('--clear-email', 'Clear the email address')

  handleCommand(update, async (id: string, options: PersonUpdateOptions) => {
    if (options.city !== undefined && options.clearCity) {
      throw new CliError('VALIDATION_ERROR', 'Use only one of --city or --clear-city.', 4)
    }

    if (options.email !== undefined && options.clearEmail) {
      throw new CliError('VALIDATION_ERROR', 'Use only one of --email or --clear-email.', 4)
    }

    return await withClient(async (client) => await updatePerson(client, id, {
      name: options.name,
      city: options.clearCity ? null : options.city,
      email: options.clearEmail ? null : options.email
    }))
  })

  const remove = person
    .command('delete')
    .description('Delete a person')
    .argument('<id>', 'Person id')

  handleCommand(remove, async (id: string) => await withClient(async (client) => await deletePerson(client, id)))
}
