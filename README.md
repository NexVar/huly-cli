# huly-cli

`huly-cli` is a JSON-first command line client for the Huly Platform API, aimed at scripts, CI jobs, and AI agents that need predictable shell commands instead of ad hoc TypeScript snippets.

The project currently implements the PRD's Phase 1 command set. The long-term target remains broader API parity across Huly entities.

## Priorities

- Performance-first CLI execution
- Predictable JSON output for automation and AI agents
- Current stable TypeScript baseline and modern Node.js compatibility
- Compatibility with both Huly cloud and self-hosted deployments

## Implemented Scope

Current Phase 1 commands:

- `auth login|status|logout`
- `project list|get`
- `issue list|get|create|update|delete`
- `member list|me`

Additional implemented commands:

- `teamspace list|create`
- `doc list|get|create|update|delete`
- `person list|get|create`
- `milestone list|create|update`

Current scope details:

- Implemented and live-tested: `auth`, `project`, `issue`, `member`, `teamspace`, `doc`, `person`, `milestone`
- Not implemented yet: `label`, `component`, `comment`, `setup-skill`, and extended Phase 5 modules
- Coverage notes: [docs/PRD_STATUS.md](docs/PRD_STATUS.md)

## Install

```bash
npm install
npm run build
```

Tooling baseline:

- Node.js `>=20`
- TypeScript `5.9.x`

Run from source:

```bash
npm run dev -- auth status
```

Run the built CLI:

```bash
node dist/bin/huly.js project list
```

## Configuration

The CLI reads configuration in this order:

1. Process environment variables
2. Local `.env`
3. `~/.huly/config.json`

Supported variables:

```bash
HULY_URL=https://huly.app
HULY_WORKSPACE=my-workspace
HULY_TOKEN=...
HULY_EMAIL=user@example.com
HULY_PASSWORD=secret
```

Example `.env`:

```bash
cp .env.example .env
```

Token-based auth is supported and is the fastest path for automation:

```bash
HULY_URL=https://huly.app
HULY_WORKSPACE=my-workspace
HULY_TOKEN=your-token
```

Login flow:

```bash
npm run dev -- auth login \
  --url https://huly.app \
  --email user@example.com \
  --workspace my-workspace \
  --password secret
```

## Usage

```bash
npm run dev -- project list
npm run dev -- issue list --project HULY --limit 10
npm run dev -- member me
npm run dev -- teamspace list
npm run dev -- doc list --teamspace "Quick-Start Docs"
npm run dev -- person list --limit 20
npm run dev -- milestone list --project WEBSI
```

Using the built binary:

```bash
node dist/bin/huly.js auth status
node dist/bin/huly.js project get HULY
node dist/bin/huly.js issue get HULY-1
node dist/bin/huly.js teamspace list
node dist/bin/huly.js person list
node dist/bin/huly.js milestone list --project WEBSI
```

Create an issue:

```bash
npm run dev -- issue create \
  --project HULY \
  --title "CLI smoke test" \
  --description "Created by huly-cli"
```

Create a document:

```bash
npm run dev -- doc create \
  --teamspace "Quick-Start Docs" \
  --title "CLI notes" \
  --content "# Notes"
```

Create a person:

```bash
npm run dev -- person create \
  --name "CLI Temp Contact" \
  --city "Istanbul" \
  --email "cli-temp-contact@example.com"
```

Create a milestone:

```bash
npm run dev -- milestone create \
  --project WEBSI \
  --label "Sprint 1" \
  --status Planned \
  --target-date 2026-04-15
```

## Output Contract

Success goes to stdout:

```json
{
  "ok": true,
  "data": []
}
```

Errors go to stderr with a non-zero exit code:

```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Issue 'HULY-42' not found"
  }
}
```

Exit codes:

- `0`: success
- `1`: general error
- `2`: authentication error
- `3`: not found
- `4`: validation error
- `5`: connection error

## Performance Notes

- Read-heavy commands avoid initializing transactional operations unless a write path is actually needed.
- The Node runtime uses the published Huly REST client plus transaction helpers, which avoids the browser-only WebSocket runtime path on modern Node releases.
- This keeps startup lighter for common read commands such as `project list`, `issue list`, and `member me`.

## Implementation Notes

- Uses official published Huly packages, centered on `@hcengineering/api-client`.
- Issue creation follows Huly’s published sequence-and-rank workflow.
- Document content is stored through the explicit markup upload path, which now works for both `doc` content and issue descriptions.
- `removeDoc` is wired for issue deletion and passed live smoke tests, but broader verification across different Huly deployments is still pending.
- The current TypeScript/compiler setup is on the latest stable 5.9 line; `tsconfig` modernization for newer Node-specific compiler modes is a separate optimization step rather than a functional blocker.
