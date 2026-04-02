# huly-cli - Product Requirements Document

## 1. Overview

**huly-cli** is a command-line interface that maps the Huly.io Platform API to CLI commands, enabling AI agents to interact with Huly workspaces quickly and reliably.

### Problem Statement

AI coding agents (Claude Code, Cursor, Copilot, etc.) need to interact with project management tools to read tasks, update statuses, create issues, and manage documentation. Currently, interacting with Huly requires writing custom TypeScript scripts using the `@hcengineering/api-client` WebSocket library. This is slow, error-prone, and impractical for AI agents that operate via shell commands.

### Solution

A CLI tool that wraps the official Huly Platform API into simple, predictable shell commands with structured JSON output. AI agents can execute commands like `huly issue list --project HULY` and receive machine-parseable JSON responses.

### Goals

- Enable AI agents to perform full CRUD on Huly entities via shell commands
- Pure JSON output for reliable machine parsing
- Support both huly.io cloud and self-hosted instances
- Use the official `@hcengineering/api-client` TypeScript library directly
- Track current official TypeScript documentation and stable compiler/runtime guidance
- Optimize for low-latency CLI execution; performance is a top priority for architecture and implementation choices
- Zero interactive prompts - every input via flags/args

### Non-Goals

- Human-friendly TUI or table formatting
- MCP server protocol
- Browser/GUI integration
- Real-time WebSocket subscriptions or event streaming

### Scope: Full API Parity

This CLI will expose **every entity and operation** available through the Huly Platform API. The API client (`@hcengineering/api-client`) is generic — `findAll`, `createDoc`, `updateDoc`, `addCollection` work with any Huly class. We will provide CLI commands for all entity types that have published type packages.

> **WARNING — Unverified API Operations**
>
> The following operations are not demonstrated in the official Huly API examples and need verification during implementation:
> - **Delete** (`removeDoc`) — not shown in any example but likely exists on the client
> - **Comments** — need to discover the correct class (likely `@hcengineering/chunter` module)
> - **Member listing** — need to find the right query pattern beyond `client.getAccount()`
>
> These may require inspecting the `@hcengineering/*` package exports or the Huly platform source code to confirm availability.

---

## 2. Target Users

**Primary:** AI agents (Claude Code, Cursor, Copilot Workspace, custom LLM agents)

AI agents will invoke `huly-cli` via shell execution to:
- Read issue details and project state before making code changes
- Update issue statuses after completing work
- Create new issues for discovered bugs or sub-tasks
- Fetch documentation context from Huly docs

**Secondary:** Developers scripting automations and CI/CD pipelines.

---

## 3. Technology

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | TypeScript (Node.js) | Official Huly API client is TypeScript; reuse types and WebSocket protocol directly |
| TypeScript Baseline | Latest stable TypeScript release | Follow current official TypeScript docs and prefer stable Node-oriented compiler options |
| API Client | `@hcengineering/api-client` | Official library, maintained by Huly team |
| CLI Framework | `commander` or `yargs` | Mature, supports subcommands and flag parsing |
| Distribution | npm (`npx huly-cli` / `npm i -g huly-cli`) | Standard Node.js distribution |
| Output | JSON to stdout | Structured, parseable by any language/agent |

### Performance Requirements

- Performance is a top-level product requirement, not a secondary optimization target
- Command startup should minimize bootstrap work and avoid unnecessary dependency initialization
- Read-only commands should prefer the lightest available client path and must not initialize write-capable subsystems unless required
- Network round trips should be minimized where API design permits
- Build output should favor fast startup and low overhead for Node.js execution
- TypeScript configuration should follow current official stable guidance for modern Node.js targets where compatible with dependencies

### Key Dependencies (from official API)

```
@hcengineering/api-client   - WebSocket API client
@hcengineering/core          - Core types (Ref, SortingOrder, generateId)
@hcengineering/tracker       - Issue, Project, Milestone types
@hcengineering/document      - Document, Teamspace types
@hcengineering/contact       - Person, Channel types
@hcengineering/tags          - TagElement, TagReference types
@hcengineering/rank          - Ranking utilities
@hcengineering/task          - ProjectType and task types
```

---

## 4. Authentication

### Config File + Environment Variables

Authentication supports two methods, with environment variables taking precedence over config file values.

#### Config File (`~/.huly/config.json`)

```json
{
  "url": "https://huly.io",
  "email": "user@example.com",
  "password": "...",
  "workspace": "my-workspace"
}
```

Created via:
```bash
huly auth login --url https://huly.io --email user@example.com --workspace my-workspace
# Prompts for password (only interactive command) and saves to ~/.huly/config.json

huly auth status
# Shows current connection info (without password)

huly auth logout
# Removes config file
```

#### Environment Variables (override config)

```bash
export HULY_URL=https://huly.io           # or http://localhost:8087 for self-hosted
export HULY_EMAIL=user@example.com
export HULY_PASSWORD=secret
export HULY_WORKSPACE=my-workspace
```

#### Resolution Order

1. Environment variables (if set)
2. Config file (`~/.huly/config.json`)
3. Error with clear JSON message if neither is configured

---

## 5. Command Structure

### Pattern

```
huly <resource> <action> [identifiers] [--flags]
```

All commands output JSON to stdout. Errors output JSON to stderr with non-zero exit codes.

### 5.1 Auth Commands

```bash
huly auth login --url <url> --email <email> --workspace <ws>
huly auth status
huly auth logout
```

### 5.2 Project Commands

```bash
huly project list
# Lists all projects
# Output: [{ "id": "...", "identifier": "HULY", "name": "...", "description": "..." }]

huly project get <identifier>
# Get project details
# Output: { "id": "...", "identifier": "HULY", "name": "...", "description": "...", "defaultIssueStatus": "..." }
```

### 5.3 Issue Commands

```bash
huly issue list --project <identifier> [--status <status>] [--assignee <email>] [--priority <priority>] [--limit <n>] [--sort <field>]
# List issues with filtering
# Output: [{ "id": "...", "identifier": "HULY-1", "title": "...", "status": "...", "priority": "...", "assignee": "..." }]

huly issue get <identifier>
# Get issue details including description (markdown)
# Output: { "id": "...", "identifier": "HULY-1", "title": "...", "description": "# Markdown content...", "status": "...", "priority": "...", "labels": [...] }

huly issue create --project <identifier> --title <title> [--description <md>] [--description-file <path>] [--priority <priority>] [--assignee <email>] [--labels <label1,label2>] [--due-date <date>] [--parent <issue-identifier>]
# Create a new issue
# Output: { "id": "...", "identifier": "HULY-42", "title": "...", ... }

huly issue update <identifier> [--title <title>] [--status <status>] [--priority <priority>] [--assignee <email>] [--due-date <date>] [--milestone <name>]
# Update issue fields
# Output: { "id": "...", "identifier": "HULY-42", ... }  (updated issue)

huly issue delete <identifier>
# Delete an issue
# Output: { "deleted": true, "identifier": "HULY-42" }
```

### 5.4 Document Commands

```bash
huly doc list --teamspace <name> [--limit <n>] [--sort <field>]
# List documents in a teamspace
# Output: [{ "id": "...", "title": "...", "content": "# Markdown..." }]

huly doc get <id>
# Get document with full markdown content
# Output: { "id": "...", "title": "...", "content": "# Full markdown content..." }

huly doc create --teamspace <name> --title <title> [--content <md>] [--content-file <path>]
# Create a document
# Output: { "id": "...", "title": "...", ... }

huly doc update <id> [--title <title>] [--content <md>] [--content-file <path>]
# Update a document
# Output: { "id": "...", "title": "...", ... }

huly doc delete <id>
# Delete a document
# Output: { "deleted": true, "id": "..." }
```

### 5.5 Teamspace Commands

```bash
huly teamspace list
# List all teamspaces
# Output: [{ "id": "...", "name": "...", "description": "..." }]

huly teamspace create --name <name> [--description <desc>] [--private]
# Create a teamspace
# Output: { "id": "...", "name": "...", ... }
```

### 5.6 Person / Contact Commands

```bash
huly person list [--limit <n>]
# List persons with contact channels
# Output: [{ "id": "...", "name": "Doe,John", "city": "...", "channels": [{ "type": "email", "value": "..." }] }]

huly person get <id>
# Get person details
# Output: { "id": "...", "name": "...", "channels": [...] }

huly person create --name <name> [--city <city>] [--email <email>]
# Create a person with optional email channel
# Output: { "id": "...", "name": "...", ... }
```

### 5.7 Milestone Commands

```bash
huly milestone list --project <identifier>
# List milestones in a project
# Output: [{ "id": "...", "label": "Sprint 1", "status": "InProgress", "targetDate": "..." }]

huly milestone create --project <identifier> --label <label> [--target-date <date>] [--status <status>]
# Create a milestone
# Output: { "id": "...", "label": "...", ... }

huly milestone update <id> [--label <label>] [--status <status>] [--target-date <date>]
# Update a milestone
# Output: { "id": "...", "label": "...", ... }
```

### 5.8 Label Commands

```bash
huly label list [--project <identifier>]
# List labels/tags
# Output: [{ "id": "...", "title": "bug", "color": 11 }]

huly label create --title <title> [--color <number>] [--description <desc>]
# Create a label
# Output: { "id": "...", "title": "...", ... }

huly label assign <issue-identifier> --label <label-title>
# Assign a label to an issue
# Output: { "assigned": true, "issue": "HULY-42", "label": "bug" }
```

### 5.9 Component Commands

```bash
huly component list --project <identifier>
# List components in a project
# Output: [{ "id": "...", "label": "Backend", "description": "..." }]

huly component create --project <identifier> --label <label> [--description <desc>]
# Create a component
# Output: { "id": "...", "label": "...", ... }
```

### 5.10 Comment Commands

```bash
huly comment list --on <issue-identifier|doc-id>
# List comments on an issue or document
# Output: [{ "id": "...", "message": "...", "author": "...", "createdOn": "..." }]

huly comment add --on <issue-identifier|doc-id> --message <text>
# Add a comment to an issue or document
# Output: { "id": "...", "message": "...", ... }
```

### 5.11 Member Commands

```bash
huly member list
# List workspace members
# Output: [{ "id": "...", "email": "...", "name": "...", "role": "..." }]

huly member me
# Get current authenticated user info
# Output: { "id": "...", "email": "...", "name": "...", ... }
```

### 5.12 Future Module Commands (as API packages become available)

The following Huly features will be supported as their `@hcengineering/*` type packages are confirmed accessible:

| Module | CLI Namespace | Entities | Status |
|--------|--------------|----------|--------|
| HR | `huly hr` | departments, employees, requests | Implemented (broad coverage; deeper parity pending) |
| Boards | `huly board` | boards, cards, columns | Implemented (broad coverage; deeper parity pending) |
| Time Tracking | `huly time` | time reports, logged time | Implemented (broad coverage; deeper parity pending) |
| Drive | `huly drive` | files, folders | Implemented (broad coverage; deeper parity pending) |
| Chat | `huly chat` | channels, messages | Implemented (broad coverage; deeper parity pending) |
| Notifications | `huly notification` | notifications, read/unread | Implemented (broad coverage; deeper parity pending) |
| Cards | `huly card` | custom types, relations, attributes | Implemented (broad coverage; deeper parity pending) |
| Recruiting | `huly recruit` | vacancies, applications, candidates | Implemented (broad coverage; deeper parity pending) |

These will follow the same `huly <resource> <action>` pattern and JSON output envelope.

---

## 6. Output Format

### Success Response

All successful commands output JSON to **stdout**:

```json
{
  "ok": true,
  "data": { ... }
}
```

For list commands:
```json
{
  "ok": true,
  "data": [ ... ],
  "total": 42
}
```

### Error Response

Errors output JSON to **stderr** with non-zero exit code:

```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Project with identifier 'FOO' not found"
  }
}
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Authentication error (missing/invalid credentials) |
| 3 | Not found (entity doesn't exist) |
| 4 | Validation error (invalid flags/args) |
| 5 | Connection error (can't reach Huly server) |

---

## 7. Internal Architecture

```
src/
  index.ts              # Entry point, CLI setup
  commands/
    auth.ts             # auth login/status/logout
    project.ts          # project list/get
    issue.ts            # issue CRUD
    document.ts         # document CRUD
    teamspace.ts        # teamspace list/create
    person.ts           # person CRUD
    milestone.ts        # milestone CRUD
    label.ts            # label CRUD + assign
    component.ts        # component list/create
    comment.ts          # comment list/add
    member.ts           # member list/me
    setup-skill.ts      # install AI agent skill file
  lib/
    client.ts           # Huly API client wrapper (connect/disconnect)
    config.ts           # Config file + env var resolution
    output.ts           # JSON output formatting (success/error)
    types.ts            # Shared CLI types and mappers
  bin/
    huly.ts             # CLI binary entry point
  skill/
    huly.md             # AI agent skill file (bundled)
```

### Key Patterns

1. **Client lifecycle:** Each command connects, executes, disconnects. No persistent connections.
2. **Output mapper:** Huly internal types are mapped to clean JSON (strip internal fields like `_class`, `modifiedBy`).
3. **Error boundary:** Top-level try/catch wraps all commands, outputs structured error JSON.
4. **Markdown handling:** Descriptions are fetched/uploaded as markdown via `client.uploadMarkup` / `client.fetchMarkup`.
5. **Performance-first execution:** The implementation should separate read and write paths so cheap commands avoid heavy transactional initialization unless strictly necessary.

---

## 8. Milestones & Phasing

### Phase 1 - Foundation (MVP)

- Project scaffolding (package.json, tsconfig, build pipeline)
- Auth system (config file + env vars)
- Client wrapper (connect/disconnect lifecycle)
- Output system (JSON success/error formatting)
- `huly auth login|status|logout`
- `huly project list|get`
- `huly issue list|get|create|update|delete`
- `huly member list|me`

### Phase 2 - Documents, Contacts & Comments

- `huly doc list|get|create|update|delete`
- `huly teamspace list|create`
- `huly person list|get|create`
- `huly comment list|add`

### Phase 3 - Extended Tracker

- `huly milestone list|create|update`
- `huly label list|create|assign`
- `huly component list|create`
- Advanced filtering (date ranges, multiple statuses, assignee)
- Sub-issue support (`--parent` flag on issue create)

### Phase 4 - AI Agent Skill & Publish

- AI agent skill file (`.claude/commands/huly.md`)
- `huly setup-skill` command
- npm package publishing
- `npx huly-cli` support
- Comprehensive error messages
- Connection retry logic
- `--version` and `--help` with JSON-formatted help output

### Phase 5 - Extended Modules

- Discover and integrate additional `@hcengineering/*` packages
- HR, boards, time tracking, drive, chat, cards, notifications, recruiting
- Each module follows the same `huly <resource> <action>` pattern

---

## 9. Configuration

### package.json (planned)

```json
{
  "name": "huly-cli",
  "version": "0.1.0",
  "description": "CLI for Huly.io Platform API - optimized for AI agents",
  "bin": {
    "huly": "./dist/bin/huly.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/bin/huly.ts"
  },
  "dependencies": {
    "@hcengineering/api-client": "^0.7.3",
    "@hcengineering/core": "^0.7.4",
    "@hcengineering/document": "^0.7.0",
    "@hcengineering/tracker": "^0.7.0",
    "@hcengineering/contact": "^0.7.0",
    "@hcengineering/tags": "^0.7.0",
    "@hcengineering/rank": "^0.7.3",
    "@hcengineering/task": "^0.7.0",
    "commander": "^12.0.0",
    "ws": "^8.16.0"
  }
}
```

---

## 10. AI Agent Skill

A lightweight skill file will be shipped with `huly-cli` so AI agents (Claude Code, etc.) can discover and use the CLI without needing separate documentation.

### Skill File: `.claude/commands/huly.md`

The skill is a markdown file that AI agents load as a slash command (`/huly`). It contains:

1. **Tool description** — what huly-cli does and when to use it
2. **Auth setup** — how to check/configure credentials
3. **Command reference** — every command with flags and example output
4. **Workflow patterns** — common multi-step sequences

### Example Skill Content

```markdown
---
name: huly
description: Interact with Huly.io project management (issues, docs, contacts) via CLI. Use when the user references Huly tasks, wants to update issue status, or needs project context.
---

# huly-cli

CLI for Huly.io Platform API. All output is JSON.

## Auth Check
Run `huly auth status` first. If it fails, ask the user to set up credentials:
- `huly auth login --url <url> --email <email> --workspace <ws>`
- Or set env vars: HULY_URL, HULY_EMAIL, HULY_PASSWORD, HULY_WORKSPACE

## Common Workflows

### Get context before coding
\`\`\`bash
huly issue get HULY-42        # Read the issue details and requirements
huly issue list --project HULY --status "In Progress"  # See what's active
\`\`\`

### Update status after work
\`\`\`bash
huly issue update HULY-42 --status "Done"
huly comment add --on HULY-42 --message "Implemented in commit abc123"
\`\`\`

### Create issues for discovered work
\`\`\`bash
huly issue create --project HULY --title "Fix null check in parser" --priority High --description "Found during work on HULY-42"
\`\`\`

## Command Reference
[Full command list with flags and output schemas]
```

### Distribution

The skill file will be:
1. Included in the npm package under `.claude/commands/huly.md`
2. Installable via `huly setup-skill` which copies it to the project's `.claude/commands/`
3. Documented in the README for manual installation

---

## 11. Design Principles

1. **JSON everywhere** - Every output is valid JSON. No plain text, no tables, no colors.
2. **No interactivity** - Every parameter is a flag or argument. No prompts except `auth login` password.
3. **Predictable structure** - `huly <resource> <action>` always. Consistent `{ ok, data }` envelope.
4. **Fail loudly** - Clear error codes and messages. Never silently succeed or swallow errors.
5. **Stateless commands** - Each invocation connects, acts, disconnects. No daemon or background process.
6. **Minimal mapping** - Expose Huly's actual concepts (projects, issues, milestones) without inventing abstractions.
