import { Command } from 'commander'
import { handleCommand } from '../lib/command'
import { installBundledSkill } from '../lib/skill'

type SetupSkillOptions = {
  dir?: string
  force?: boolean
}

export function registerSetupSkillCommand(program: Command): void {
  const setupSkill = program
    .command('setup-skill')
    .description("Copy the bundled Huly agent skill into a project's .claude/commands directory")
    .option('--dir <path>', 'Project directory to install into', process.cwd())
    .option('--force', 'Overwrite an existing skill file')

  handleCommand(setupSkill, async (options: SetupSkillOptions) => {
    const install = await installBundledSkill(options.dir ?? process.cwd(), Boolean(options.force))

    return {
      installed: true,
      source: install.source,
      destination: install.destination,
      overwritten: install.overwritten
    }
  })
}
