# huly-cli

`huly-cli` is a JSON-first command line client for the Huly Platform API, aimed at scripts, CI jobs, and AI agents that need predictable shell commands instead of ad hoc TypeScript snippets.

## Implemented Scope

Current Phase 1 commands:

- `auth login|status|logout`
- `project list|get`
- `issue list|get|create|update|delete`
- `member list|me`

## Install

```bash
npm install
npm run build
```

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
```

Create an issue:

```bash
npm run dev -- issue create \
  --project HULY \
  --title "CLI smoke test" \
  --description "Created by huly-cli"
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

## Implementation Notes

- Uses the published `@hcengineering/api-client` package.
- For Node execution the CLI uses the package REST client plus Huly transaction helpers, which avoids the browser-only runtime path hit by the WebSocket client on modern Node releases.
- Issue creation follows Huly’s published sequence-and-rank workflow.
- `removeDoc` is wired for issue deletion, but this still needs broader verification against different Huly deployments.
