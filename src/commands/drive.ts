import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { withClient } from '../lib/client'
import { createDrive, createDriveFile, createDriveFolder, deleteDrive, deleteDriveFile, deleteDriveFolder, getDriveFileSummary, getDriveFolderSummary, getDriveSummary, listDriveFiles, listDriveFolders, listDrives, updateDrive, updateDriveFile, updateDriveFolder } from '../lib/huly'
import { CliError } from '../lib/output'

type DriveCreateOptions = {
  name: string
  description?: string
  private?: boolean
}

type DriveUpdateOptions = {
  name?: string
  description?: string
  private?: boolean
  public?: boolean
  archive?: boolean
  unarchive?: boolean
}

type DriveResourceCreateOptions = {
  title: string
  name?: string
}

type DriveResourceUpdateOptions = {
  title?: string
  name?: string
}

function resolvePrivate(options: Pick<DriveUpdateOptions, 'private' | 'public'>): boolean | undefined {
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

function resolveArchived(options: Pick<DriveUpdateOptions, 'archive' | 'unarchive'>): boolean | undefined {
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

export function registerDriveCommands(program: Command): void {
  const drive = program.command('drive').description('Drive space commands')

  const list = drive
    .command('list')
    .description('List drives')

  handleCommand(list, async () => await withClient(async (client) => await listDrives(client)))

  const get = drive
    .command('get')
    .description('Get one drive by id')
    .argument('<id>', 'Drive id')

  handleCommand(get, async (id: string) => await withClient(async (client) => await getDriveSummary(client, id)))

  const create = drive
    .command('create')
    .description('Create a drive')
    .requiredOption('--name <name>', 'Drive name')
    .option('--description <text>', 'Drive description')
    .option('--private', 'Create the drive as private')

  handleCommand(create, async (options: DriveCreateOptions) => {
    return await withClient(async (client) => await createDrive(client, options))
  })

  const update = drive
    .command('update')
    .description('Update a drive')
    .argument('<id>', 'Drive id')
    .option('--name <name>', 'Drive name')
    .option('--description <text>', 'Drive description')
    .option('--private', 'Set the drive to private')
    .option('--public', 'Set the drive to public')
    .option('--archive', 'Archive the drive')
    .option('--unarchive', 'Unarchive the drive')

  handleCommand(update, async (id: string, options: DriveUpdateOptions) => {
    return await withClient(async (client) => await updateDrive(client, id, {
      name: options.name,
      description: options.description,
      private: resolvePrivate(options),
      archived: resolveArchived(options)
    }))
  })

  const remove = drive
    .command('delete')
    .description('Delete a drive')
    .argument('<id>', 'Drive id')

  handleCommand(remove, async (id: string) => await withClient(async (client) => await deleteDrive(client, id)))

  const folder = drive.command('folder').description('Drive folder commands')

  const folderList = folder
    .command('list')
    .description('List drive folders')

  handleCommand(folderList, async () => await withClient(async (client) => await listDriveFolders(client)))

  const folderGet = folder
    .command('get')
    .description('Get one drive folder by id')
    .argument('<id>', 'Drive folder id')

  handleCommand(folderGet, async (id: string) => await withClient(async (client) => await getDriveFolderSummary(client, id)))

  const folderCreate = folder
    .command('create')
    .description('Create a drive folder')
    .requiredOption('--title <title>', 'Drive folder title')
    .option('--name <name>', 'Drive folder name; defaults to the title')

  handleCommand(folderCreate, async (options: DriveResourceCreateOptions) => {
    return await withClient(async (client) => await createDriveFolder(client, options))
  })

  const folderUpdate = folder
    .command('update')
    .description('Update a drive folder')
    .argument('<id>', 'Drive folder id')
    .option('--title <title>', 'Drive folder title')
    .option('--name <name>', 'Drive folder name')

  handleCommand(folderUpdate, async (id: string, options: DriveResourceUpdateOptions) => {
    return await withClient(async (client) => await updateDriveFolder(client, id, options))
  })

  const folderDelete = folder
    .command('delete')
    .description('Delete a drive folder')
    .argument('<id>', 'Drive folder id')

  handleCommand(folderDelete, async (id: string) => await withClient(async (client) => await deleteDriveFolder(client, id)))

  const file = drive.command('file').description('Drive file commands')

  const fileList = file
    .command('list')
    .description('List drive files')

  handleCommand(fileList, async () => await withClient(async (client) => await listDriveFiles(client)))

  const fileGet = file
    .command('get')
    .description('Get one drive file by id')
    .argument('<id>', 'Drive file id')

  handleCommand(fileGet, async (id: string) => await withClient(async (client) => await getDriveFileSummary(client, id)))

  const fileCreate = file
    .command('create')
    .description('Create a drive file record')
    .requiredOption('--title <title>', 'Drive file title')
    .option('--name <name>', 'Drive file name; defaults to the title')

  handleCommand(fileCreate, async (options: DriveResourceCreateOptions) => {
    return await withClient(async (client) => await createDriveFile(client, options))
  })

  const fileUpdate = file
    .command('update')
    .description('Update a drive file record')
    .argument('<id>', 'Drive file id')
    .option('--title <title>', 'Drive file title')
    .option('--name <name>', 'Drive file name')

  handleCommand(fileUpdate, async (id: string, options: DriveResourceUpdateOptions) => {
    return await withClient(async (client) => await updateDriveFile(client, id, options))
  })

  const fileDelete = file
    .command('delete')
    .description('Delete a drive file record')
    .argument('<id>', 'Drive file id')

  handleCommand(fileDelete, async (id: string) => await withClient(async (client) => await deleteDriveFile(client, id)))
}
