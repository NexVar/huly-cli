import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { createPerson, getPersonSummary, listPersons } from '../lib/huly'
import { CliError } from '../lib/output'

type PersonListOptions = {
  limit?: string
}

type PersonCreateOptions = {
  name: string
  city?: string
  email?: string
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
    .option('--limit <n>', 'Maximum number of persons')

  handleCommand(list, async (options: PersonListOptions) => {
    const limit = parseLimit(options.limit)
    return await withClient(async (client) => await listPersons(client, limit))
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
}
