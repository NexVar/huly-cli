import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { CliError } from './output'
import { getBundledSkillPath, installBundledSkill } from './skill'

test('installBundledSkill copies the bundled skill into the target project', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'huly-cli-skill-'))

  try {
    const result = await installBundledSkill(tempDir, false)
    const installed = await readFile(result.destination, 'utf8')
    const bundled = await readFile(getBundledSkillPath(), 'utf8')

    assert.equal(result.overwritten, false)
    assert.equal(installed, bundled)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('installBundledSkill requires --force when the skill file already exists', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'huly-cli-skill-'))
  const skillPath = join(tempDir, '.claude', 'commands', 'huly.md')

  try {
    await installBundledSkill(tempDir, false)
    await writeFile(skillPath, 'custom\n', 'utf8')

    await assert.rejects(
      installBundledSkill(tempDir, false),
      (error: unknown) =>
        error instanceof CliError &&
        error.code === 'VALIDATION_ERROR' &&
        error.message.includes('Pass --force')
    )
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('installBundledSkill overwrites an existing skill file when forced', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'huly-cli-skill-'))
  const skillPath = join(tempDir, '.claude', 'commands', 'huly.md')

  try {
    await installBundledSkill(tempDir, false)
    await writeFile(skillPath, 'custom\n', 'utf8')

    const result = await installBundledSkill(tempDir, true)
    const installed = await readFile(skillPath, 'utf8')
    const bundled = await readFile(getBundledSkillPath(), 'utf8')

    assert.equal(result.overwritten, true)
    assert.equal(installed, bundled)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})
