# huly

Command-line client for the [Huly](https://huly.app) platform. Manage projects, issues, documents, boards, chat, HR, recruiting, and more — straight from your terminal.

Every command returns clean JSON, so it works equally well for humans, shell scripts, CI pipelines, and AI agents.

## Install

```bash
npm install -g @nexvar/huly
```

Or run without installing:

```bash
npx @nexvar/huly --help
```

Requires **Node.js 20+**.

## Give it to your AI agent

Want your AI agent (Claude Code, Cursor, Windsurf, Copilot, etc.) to manage your Huly workspace? Copy-paste this prompt:

```
Go to https://github.com/NexVar/huly-cli and install the huly CLI.
Then add the skill file from https://github.com/NexVar/huly-cli/blob/main/SKILL.md to your skills.
```

That's it. The agent will install `@nexvar/huly` and learn every available command from the skill file.

> Keep secrets out of tracked files. Use environment variables or a local `.env` instead.

## Quick start

### 1. Authenticate

Set these environment variables (or put them in a `.env` file):

```bash
HULY_URL=https://huly.app
HULY_WORKSPACE=my-workspace
HULY_TOKEN=your-token
```

Or log in interactively:

```bash
huly auth login \
  --url https://huly.app \
  --email you@example.com \
  --workspace my-workspace \
  --password secret
```

Verify:

```bash
huly auth status
```

### 2. Try a few commands

```bash
huly project list
huly issue list --project HULY --limit 10
huly member me
```

Create an issue:

```bash
huly issue create \
  --project HULY \
  --title "My first CLI issue" \
  --description "Created from the terminal"
```

That's it — you're up and running.

## What you can do

| Area | Commands |
|---|---|
| **Auth** | `login` · `status` · `logout` |
| **Projects** | `list` · `get` · `create` · `update` · `delete` |
| **Issues** | `list` · `get` · `create` · `update` · `delete` · `template list/get` · `relation add/remove` · `blocker add/remove` |
| **Members** | `list` · `me` |
| **Teamspaces** | `list` · `get` · `create` · `update` · `delete` |
| **Documents** | `list` · `get` · `create` · `update` · `delete` |
| **People** | `list` · `get` · `create` · `update` · `delete` |
| **Milestones** | `list` · `get` · `create` · `update` · `delete` |
| **Labels** | `list` · `get` · `create` · `update` · `assign` · `unassign` · `delete` |
| **Components** | `list` · `get` · `create` · `update` · `delete` |
| **Comments** | `list` · `add` |
| **Boards** | `list` · `get` · `create` · `update` · `delete` · `status list` · `column list/get` · `card list/get/create/update/move/delete` |
| **Cards** | `types` · `type CRUD` · `role CRUD` · `list` · `get` · `create` · `update` · `move` · `delete` |
| **Chat** | `list` · `get` · `create` · `update` · `delete` · `direct get/create` · `member list/add/remove` · `message list/get/send/update/delete` · `thread list/get/send/update/delete` |
| **Drive** | `list` · `get` · `create` · `update` · `delete` · `activity` · `folder CRUD + activity` · `file CRUD + activity` |
| **HR** | `department CRUD` · `employee list/get` · `public-holiday CRUD` · `request-type list` · `request CRUD` |
| **Notifications** | `list` · `get` · `read` · `unread` · `archive` · `unarchive` |
| **Recruiting** | `vacancy CRUD` · `applicant-status list` · `applicant CRUD + move` · `candidate CRUD` · `review CRUD` · `opinion CRUD` |
| **Time** | `list` · `get` · `create` · `update` · `done` · `open` · `delete` · `report list/get/totals/create/update/delete` |
| **Raw** | Low-level document, collection, mixin, and markup operations for anything not covered above |

Run `huly <command> --help` on any command for full options.

## More examples

<details>
<summary>Issues — sub-issues, time tracking, milestones</summary>

```bash
# Sub-issue
huly issue create --project WEBSI --title "Child task" --parent WEBSI-123

# Time estimates
huly issue create --project WEBSI --title "Tracked task" --estimation 4 --remaining-time 2.5
huly issue update WEBSI-123 --estimation 6

# Milestone
huly issue update WEBSI-123 --milestone "Sprint 1"

# Templates
huly issue template list --project WEBSI --limit 10
```

</details>

<details>
<summary>Boards and cards</summary>

```bash
huly board create --name "Sprint board"
huly board card create --board <board-id> --title "Task" --status tracker:status:Todo
huly board card move <card-id> --top
huly board column list --board <board-id>
```

</details>

<details>
<summary>Chat — channels, DMs, threads</summary>

```bash
huly chat create --name "dev-updates" --topic "Dev discussion"
huly chat message send --chat <chat-id> --message "Hello from the CLI"
huly chat direct create --member teammate@example.com
huly chat thread send <message-id> --message "Thread reply"
```

</details>

<details>
<summary>Documents, people, labels, components</summary>

```bash
huly doc create --teamspace "Quick-Start Docs" --title "CLI notes" --content "# Notes"
huly person create --name "Jane Doe" --city "Istanbul" --email "jane@example.com"
huly label create --title bug --color 11 --description "Bug reports"
huly label assign WEBSI-123 --label bug
huly component create --project WEBSI --label Backend --description "Backend services"
```

</details>

<details>
<summary>Time tracking — todos and reports</summary>

```bash
huly time create --issue HULY-1 --title "Follow up" --description "From CLI"
huly time done <todo-id>

huly time report create --issue HULY-1 --value 1.5 --description "Investigation"
huly time report totals --issue HULY-1
```

</details>

<details>
<summary>Comments and notifications</summary>

```bash
huly comment list --on WEBSI-123
huly comment add --on WEBSI-123 --message "Fixed in commit abc123"

huly notification list --unread --active
huly notification read <notification-id>
```

</details>

## Output format

Every response is JSON. Success goes to stdout, errors to stderr.

```jsonc
// Success (exit 0)
{ "ok": true, "data": [ ... ] }

// Error (exit 1–5)
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "Issue 'HULY-42' not found" } }
```

| Exit code | Meaning |
|---|---|
| 0 | Success |
| 1 | General error |
| 2 | Auth error |
| 3 | Not found |
| 4 | Validation error |
| 5 | Connection error |

## Configuration

The CLI reads config in this order (later wins):

1. `~/.huly/config.json`
2. `.env` file in the current directory
3. Environment variables

```bash
HULY_URL=https://huly.app        # default
HULY_WORKSPACE=my-workspace
HULY_TOKEN=...                   # fastest for automation
HULY_EMAIL=user@example.com      # alternative: email + password
HULY_PASSWORD=secret
```

Works with both Huly Cloud and self-hosted deployments.

## Development

```bash
git clone https://github.com/NexVar/huly-cli.git
cd huly-cli
npm install
npm run build
```

Run from source:

```bash
npm run dev -- auth status
npm run dev -- project list
```

Run tests:

```bash
npm test
```

Run live smoke tests (requires auth):

```bash
npm run smoke
```

## License

MIT
