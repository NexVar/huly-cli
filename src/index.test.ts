import assert from 'node:assert/strict'
import test from 'node:test'
import { main } from './index'

async function captureStreams(fn: () => Promise<void>): Promise<{ stdout: string, stderr: string }> {
  let stdout = ''
  let stderr = ''
  const originalStdoutWrite = process.stdout.write.bind(process.stdout)
  const originalStderrWrite = process.stderr.write.bind(process.stderr)

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += chunk.toString()
    return true
  }) as typeof process.stdout.write

  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += chunk.toString()
    return true
  }) as typeof process.stderr.write

  try {
    await fn()
  } finally {
    process.stdout.write = originalStdoutWrite
    process.stderr.write = originalStderrWrite
  }

  return { stdout, stderr }
}

test('main returns JSON for --help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', '--help'])
  })

  assert.equal(stderr, '')

  const payload = JSON.parse(stdout) as {
    ok: boolean
    data: {
      command: string
      commands: Array<{ name: string }>
    }
  }

  assert.equal(payload.ok, true)
  assert.equal(payload.data.command, 'huly')
  assert.ok(payload.data.commands.some((command) => command.name === 'card'))
  assert.ok(payload.data.commands.some((command) => command.name === 'chat'))
  assert.ok(payload.data.commands.some((command) => command.name === 'notification'))
  assert.ok(payload.data.commands.some((command) => command.name === 'time'))
  assert.ok(payload.data.commands.some((command) => command.name === 'setup-skill'))
})

test('main returns JSON for nested command help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', 'issue', '--help'])
  })

  assert.equal(stderr, '')

  const payload = JSON.parse(stdout) as {
    ok: boolean
    data: {
      command: string
      commands: Array<{ name: string }>
    }
  }

  assert.equal(payload.ok, true)
  assert.equal(payload.data.command, 'issue')
  assert.ok(payload.data.commands.some((command) => command.name === 'list'))
})

test('main returns JSON for notification help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', 'notification', '--help'])
  })

  assert.equal(stderr, '')

  const payload = JSON.parse(stdout) as {
    ok: boolean
    data: {
      command: string
      commands: Array<{ name: string }>
    }
  }

  assert.equal(payload.ok, true)
  assert.equal(payload.data.command, 'notification')
  assert.ok(payload.data.commands.some((command) => command.name === 'list'))
  assert.ok(payload.data.commands.some((command) => command.name === 'read'))
  assert.ok(payload.data.commands.some((command) => command.name === 'archive'))
})

test('main returns JSON for card help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', 'card', '--help'])
  })

  assert.equal(stderr, '')

  const payload = JSON.parse(stdout) as {
    ok: boolean
    data: {
      command: string
      commands: Array<{ name: string }>
    }
  }

  assert.equal(payload.ok, true)
  assert.equal(payload.data.command, 'card')
  assert.ok(payload.data.commands.some((command) => command.name === 'types'))
  assert.ok(payload.data.commands.some((command) => command.name === 'list'))
  assert.ok(payload.data.commands.some((command) => command.name === 'create'))
})

test('main returns JSON for chat help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', 'chat', '--help'])
  })

  assert.equal(stderr, '')

  const payload = JSON.parse(stdout) as {
    ok: boolean
    data: {
      command: string
      commands: Array<{ name: string }>
    }
  }

  assert.equal(payload.ok, true)
  assert.equal(payload.data.command, 'chat')
  assert.ok(payload.data.commands.some((command) => command.name === 'list'))
  assert.ok(payload.data.commands.some((command) => command.name === 'create'))
  assert.ok(payload.data.commands.some((command) => command.name === 'message'))
})

test('main returns JSON for chat message help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', 'chat', 'message', '--help'])
  })

  assert.equal(stderr, '')

  const payload = JSON.parse(stdout) as {
    ok: boolean
    data: {
      command: string
      commands: Array<{ name: string }>
    }
  }

  assert.equal(payload.ok, true)
  assert.equal(payload.data.command, 'message')
  assert.ok(payload.data.commands.some((command) => command.name === 'list'))
  assert.ok(payload.data.commands.some((command) => command.name === 'send'))
  assert.ok(payload.data.commands.some((command) => command.name === 'delete'))
})

test('main returns JSON for time help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', 'time', '--help'])
  })

  assert.equal(stderr, '')

  const payload = JSON.parse(stdout) as {
    ok: boolean
    data: {
      command: string
      commands: Array<{ name: string }>
    }
  }

  assert.equal(payload.ok, true)
  assert.equal(payload.data.command, 'time')
  assert.ok(payload.data.commands.some((command) => command.name === 'list'))
  assert.ok(payload.data.commands.some((command) => command.name === 'create'))
  assert.ok(payload.data.commands.some((command) => command.name === 'done'))
})

test('main returns JSON for --version', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', '--version'])
  })

  assert.equal(stderr, '')

  const payload = JSON.parse(stdout) as {
    ok: boolean
    data: {
      name: string
      version: string
    }
  }

  assert.equal(payload.ok, true)
  assert.equal(payload.data.name, 'huly')
  assert.match(payload.data.version, /^\d+\.\d+\.\d+/)
})
