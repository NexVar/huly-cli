---
name: huly
description: Interact with Huly workspaces from the CLI for projects, issues, docs, boards, chat, drive, recruiting, HR, notifications, and time tracking.
---

# huly-cli

`huly` is a JSON-first CLI for Huly. Use it for automation, CI jobs, and agent workflows that need predictable shell output.

## Auth Check

Check auth before doing anything else:

```bash
huly auth status
```

Fastest automation path:

```bash
export HULY_URL=https://huly.app
export HULY_WORKSPACE=my-workspace
export HULY_TOKEN=your-token
```

Password login is also supported:

```bash
huly auth login \
  --url https://huly.app \
  --workspace my-workspace \
  --email user@example.com \
  --password secret
```

## Output Contract

- Success is JSON on stdout
- Errors are JSON on stderr with a non-zero exit code
- Avoid parsing help text; parse command output instead

## Common Workflows

### Read project context

```bash
huly project list
huly project get HULY
huly member me
```

### Work with issues

```bash
huly issue get HULY-42
huly issue list --project HULY --limit 10
huly issue create --project HULY --title "Fix parser null check"
huly issue update HULY-42 --status "Done"
```

### Documents, spaces, and contacts

```bash
huly teamspace list --active
huly doc list --teamspace "Engineering" --root
huly doc create --teamspace "Engineering" --title "Runbook" --parent <doc-id>
huly person list --limit 20
```

### Collaboration updates

```bash
huly comment list --on HULY-42
huly comment add --on HULY-42 --message "Implemented in commit abc123"
```

### Extended workspace modules

```bash
huly board list --active
huly board card list --board <board-id> --member <employee-id>
huly chat list --active
huly drive list --active
huly recruit vacancy list --active
huly time report totals --issue HULY-42
```

## Supported Commands

- `auth login|status|logout`
- `project list|get`
- `issue list|get|create|update|delete|template list|get|relation add|relation remove|blocker add|blocker remove`
- `member list|me`
- `teamspace list|get|create|update|delete`
- `doc list|get|create|update|delete`
- `person list|get|create|update|delete`
- `milestone list|get|create|update|delete`
- `label list|get|create|update|assign|unassign|delete`
- `component list|get|create|update|delete`
- `comment list|add`
- `board list|get|create|update|delete`
- `board column list|get`
- `board card list|get|create|update|move|delete`
- `card types|type list|get|create|update|delete|role list|get|create|update|delete|list|get|create|update|move|delete`
- `chat list|get|create|update|delete`
- `chat direct get|create`
- `chat member list|add|remove`
- `chat message list|get|send|update|delete`
- `chat thread list|get|send|update|delete`
- `drive list|get|create|update|delete`
- `drive folder list|get|create|update|delete`
- `drive file list|get|create|update|delete|activity`
- `hr department list|get|create|update|delete`
- `hr employee list|get`
- `hr public-holiday list|get|create|update|delete`
- `hr request-type list`
- `hr request list|get|create|update|delete`
- `notification list|get|read|unread|archive|unarchive`
- `recruit vacancy list|get|create|update|delete`
- `recruit applicant-status list`
- `recruit applicant list|get|create|update|move|delete`
- `recruit candidate list|get|create|update|delete`
- `recruit review list|get|create|update|delete`
- `recruit opinion list|get|create|update|delete`
- `time list|get|create|update|done|open|delete`
- `time report list|get|totals|create|update|delete`
- `setup-skill`

## Notes

- Prefer token auth for scripts and agent runtimes
- The CLI is performance-first and keeps output machine-readable
- The CLI already covers the original Phase 1 surface plus broad extended-module support, but deeper parity work is still in progress in some module families
