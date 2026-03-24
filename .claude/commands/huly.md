---
name: huly
description: Interact with Huly projects, issues, docs, people, milestones, labels, components, and comments from the CLI. Use when work needs Huly context or status updates.
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

### Tracker planning

```bash
huly milestone list --project HULY
huly label list
huly component list --project HULY
```

### Documents and contacts

```bash
huly teamspace list
huly doc list --teamspace "Engineering"
huly person list --limit 20
```

### Leave status updates

```bash
huly comment list --on HULY-42
huly comment add --on HULY-42 --message "Implemented in commit abc123"
```

## Supported Commands

- `auth login|status|logout`
- `project list|get`
- `issue list|get|create|update|delete`
- `member list|me`
- `teamspace list|create`
- `doc list|get|create|update|delete`
- `person list|get|create`
- `milestone list|create|update`
- `label list|create|assign`
- `component list|create`
- `comment list|add`
- `setup-skill`

## Notes

- Prefer token auth for scripts and agent runtimes
- The CLI is performance-first and keeps output machine-readable
- Some PRD items are still in progress, especially Phase 5 extended modules
