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
  assert.ok(payload.data.commands.some((command) => command.name === 'board'))
  assert.ok(payload.data.commands.some((command) => command.name === 'card'))
  assert.ok(payload.data.commands.some((command) => command.name === 'chat'))
  assert.ok(payload.data.commands.some((command) => command.name === 'drive'))
  assert.ok(payload.data.commands.some((command) => command.name === 'hr'))
  assert.ok(payload.data.commands.some((command) => command.name === 'notification'))
  assert.ok(payload.data.commands.some((command) => command.name === 'recruit'))
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
  assert.ok(payload.data.commands.some((command) => command.name === 'template'))
  assert.ok(payload.data.commands.some((command) => command.name === 'relation'))
  assert.ok(payload.data.commands.some((command) => command.name === 'blocker'))
})

test('main returns JSON for issue template help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', 'issue', 'template', '--help'])
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
  assert.equal(payload.data.command, 'template')
  assert.ok(payload.data.commands.some((command) => command.name === 'list'))
  assert.ok(payload.data.commands.some((command) => command.name === 'get'))
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
  assert.ok(payload.data.commands.some((command) => command.name === 'type'))
  assert.ok(payload.data.commands.some((command) => command.name === 'role'))
  assert.ok(payload.data.commands.some((command) => command.name === 'list'))
  assert.ok(payload.data.commands.some((command) => command.name === 'create'))
})

test('main returns JSON for board help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', 'board', '--help'])
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
  assert.equal(payload.data.command, 'board')
  assert.ok(payload.data.commands.some((command) => command.name === 'list'))
  assert.ok(payload.data.commands.some((command) => command.name === 'card'))
  assert.ok(payload.data.commands.some((command) => command.name === 'column'))
  assert.ok(payload.data.commands.some((command) => command.name === 'create'))
  assert.ok(payload.data.commands.some((command) => command.name === 'delete'))
})

test('main returns JSON for board column help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', 'board', 'column', '--help'])
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
  assert.equal(payload.data.command, 'column')
  assert.ok(payload.data.commands.some((command) => command.name === 'list'))
})

test('main returns JSON for board card help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', 'board', 'card', '--help'])
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
  assert.ok(payload.data.commands.some((command) => command.name === 'list'))
  assert.ok(payload.data.commands.some((command) => command.name === 'get'))
  assert.ok(payload.data.commands.some((command) => command.name === 'create'))
  assert.ok(payload.data.commands.some((command) => command.name === 'update'))
  assert.ok(payload.data.commands.some((command) => command.name === 'move'))
  assert.ok(payload.data.commands.some((command) => command.name === 'delete'))
})

test('main returns JSON for card type help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', 'card', 'type', '--help'])
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
  assert.equal(payload.data.command, 'type')
  assert.ok(payload.data.commands.some((command) => command.name === 'list'))
  assert.ok(payload.data.commands.some((command) => command.name === 'create'))
  assert.ok(payload.data.commands.some((command) => command.name === 'delete'))
})

test('main returns JSON for card role help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', 'card', 'role', '--help'])
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
  assert.equal(payload.data.command, 'role')
  assert.ok(payload.data.commands.some((command) => command.name === 'list'))
  assert.ok(payload.data.commands.some((command) => command.name === 'create'))
  assert.ok(payload.data.commands.some((command) => command.name === 'delete'))
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
  assert.ok(payload.data.commands.some((command) => command.name === 'direct'))
  assert.ok(payload.data.commands.some((command) => command.name === 'member'))
  assert.ok(payload.data.commands.some((command) => command.name === 'message'))
  assert.ok(payload.data.commands.some((command) => command.name === 'thread'))
})

test('main returns JSON for drive help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', 'drive', '--help'])
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
  assert.equal(payload.data.command, 'drive')
  assert.ok(payload.data.commands.some((command) => command.name === 'list'))
  assert.ok(payload.data.commands.some((command) => command.name === 'create'))
  assert.ok(payload.data.commands.some((command) => command.name === 'folder'))
  assert.ok(payload.data.commands.some((command) => command.name === 'file'))
  assert.ok(payload.data.commands.some((command) => command.name === 'delete'))
})

test('main returns JSON for drive folder help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', 'drive', 'folder', '--help'])
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
  assert.equal(payload.data.command, 'folder')
  assert.ok(payload.data.commands.some((command) => command.name === 'list'))
  assert.ok(payload.data.commands.some((command) => command.name === 'create'))
  assert.ok(payload.data.commands.some((command) => command.name === 'activity'))
  assert.ok(payload.data.commands.some((command) => command.name === 'delete'))
})

test('main returns JSON for drive file help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', 'drive', 'file', '--help'])
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
  assert.equal(payload.data.command, 'file')
  assert.ok(payload.data.commands.some((command) => command.name === 'list'))
  assert.ok(payload.data.commands.some((command) => command.name === 'create'))
  assert.ok(payload.data.commands.some((command) => command.name === 'activity'))
  assert.ok(payload.data.commands.some((command) => command.name === 'delete'))
})

test('main returns JSON for hr help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', 'hr', '--help'])
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
  assert.equal(payload.data.command, 'hr')
  assert.ok(payload.data.commands.some((command) => command.name === 'department'))
  assert.ok(payload.data.commands.some((command) => command.name === 'employee'))
  assert.ok(payload.data.commands.some((command) => command.name === 'public-holiday'))
  assert.ok(payload.data.commands.some((command) => command.name === 'request'))
})

test('main returns JSON for hr public-holiday help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', 'hr', 'public-holiday', '--help'])
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
  assert.equal(payload.data.command, 'public-holiday')
  assert.ok(payload.data.commands.some((command) => command.name === 'list'))
  assert.ok(payload.data.commands.some((command) => command.name === 'create'))
  assert.ok(payload.data.commands.some((command) => command.name === 'delete'))
})

test('main returns JSON for recruit help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', 'recruit', '--help'])
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
  assert.equal(payload.data.command, 'recruit')
  assert.ok(payload.data.commands.some((command) => command.name === 'vacancy'))
  assert.ok(payload.data.commands.some((command) => command.name === 'applicant'))
  assert.ok(payload.data.commands.some((command) => command.name === 'applicant-status'))
  assert.ok(payload.data.commands.some((command) => command.name === 'candidate'))
  assert.ok(payload.data.commands.some((command) => command.name === 'review'))
  assert.ok(payload.data.commands.some((command) => command.name === 'opinion'))
})

test('main returns JSON for recruit review help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', 'recruit', 'review', '--help'])
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
  assert.equal(payload.data.command, 'review')
  assert.ok(payload.data.commands.some((command) => command.name === 'list'))
  assert.ok(payload.data.commands.some((command) => command.name === 'get'))
  assert.ok(payload.data.commands.some((command) => command.name === 'create'))
  assert.ok(payload.data.commands.some((command) => command.name === 'update'))
  assert.ok(payload.data.commands.some((command) => command.name === 'delete'))
})

test('main returns JSON for recruit opinion help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', 'recruit', 'opinion', '--help'])
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
  assert.equal(payload.data.command, 'opinion')
  assert.ok(payload.data.commands.some((command) => command.name === 'list'))
  assert.ok(payload.data.commands.some((command) => command.name === 'get'))
  assert.ok(payload.data.commands.some((command) => command.name === 'create'))
  assert.ok(payload.data.commands.some((command) => command.name === 'update'))
  assert.ok(payload.data.commands.some((command) => command.name === 'delete'))
})

test('main returns JSON for recruit applicant-status help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', 'recruit', 'applicant-status', '--help'])
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
  assert.equal(payload.data.command, 'applicant-status')
  assert.ok(payload.data.commands.some((command) => command.name === 'list'))
})

test('main returns JSON for chat direct help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', 'chat', 'direct', '--help'])
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
  assert.equal(payload.data.command, 'direct')
  assert.ok(payload.data.commands.some((command) => command.name === 'get'))
  assert.ok(payload.data.commands.some((command) => command.name === 'create'))
})

test('main returns JSON for chat member help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', 'chat', 'member', '--help'])
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
  assert.equal(payload.data.command, 'member')
  assert.ok(payload.data.commands.some((command) => command.name === 'list'))
  assert.ok(payload.data.commands.some((command) => command.name === 'add'))
  assert.ok(payload.data.commands.some((command) => command.name === 'remove'))
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

test('main returns JSON for chat thread help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', 'chat', 'thread', '--help'])
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
  assert.equal(payload.data.command, 'thread')
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
  assert.ok(payload.data.commands.some((command) => command.name === 'report'))
})

test('main returns JSON for time report help', async () => {
  const { stdout, stderr } = await captureStreams(async () => {
    await main(['node', 'huly', 'time', 'report', '--help'])
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
  assert.equal(payload.data.command, 'report')
  assert.ok(payload.data.commands.some((command) => command.name === 'list'))
  assert.ok(payload.data.commands.some((command) => command.name === 'totals'))
  assert.ok(payload.data.commands.some((command) => command.name === 'create'))
  assert.ok(payload.data.commands.some((command) => command.name === 'delete'))
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
