# Huly CLI Skill

Use `huly` for machine-readable Huly workspace access from a shell or AI agent.

## Install

`npm install -g @nexvar/huly`

Binary name after install: `huly`

Without global install:

`npx @nexvar/huly auth status`

## Auth

Preferred env vars:

`HULY_URL=https://huly.app`
`HULY_WORKSPACE=your-workspace`
`HULY_TOKEN=your-token`

Self-hosted example:

`HULY_URL=http://localhost:8087`

First check:

`huly auth status`

## Use It For

- projects, issues, docs, people, teamspaces
- boards, cards, chat, drive, HR, recruit, time, notifications
- low-level fallback with `raw`

## Default Rule

- use dedicated commands first
- use `raw` only when the dedicated surface does not cover the needed operation

## Common Commands

`huly project list`

`huly issue list --project HULY --limit 10`

`huly issue get HULY-123`

`huly issue create --project HULY --title "New issue"`

`huly issue update HULY-123 --status "In Progress"`

`huly teamspace list`

`huly doc list --teamspace "Engineering"`

`huly doc create --teamspace "Engineering" --title "Runbook" --content "# Runbook"`

`huly person list --limit 20`

`huly board card list --board <board-id> --limit 20`

`huly chat list --limit 20`

`huly notification list --unread --active`

`huly time list --issue HULY-123`

`huly time report list --issue HULY-123`

`huly recruit vacancy list`

## Raw Fallback

Example:

`huly raw list --class document:class:Document --query '{"title":"Example"}'`

Supported low-level operations include:

- document CRUD
- collection add/update/remove
- mixin create/update
- markup fetch/upload

Inline markup JSON:

`{"description":{"$markup":{"format":"markdown","content":"# Title"}}}`

## Safety

- prefer unique prefixes like `agent-test-<timestamp>` for temporary records
- do not mutate real workspace data unless the task requires it
- read returned JSON, do not assume success
