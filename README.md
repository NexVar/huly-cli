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
- `label list|create|assign`
- `component list|create`
- `comment list|add`
- `setup-skill`

Current scope details:

- Implemented: `auth`, `project`, `issue`, `member`, `teamspace`, `doc`, `person`, `milestone`, `label`, `component`, `comment`, `setup-skill`
- Not implemented yet: extended Phase 5 modules
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

Install the bundled AI skill into the current project:

```bash
node dist/bin/huly.js setup-skill
```

JSON metadata output:

```bash
node dist/bin/huly.js --help
node dist/bin/huly.js issue --help
node dist/bin/huly.js --version
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
npm run dev -- label list
npm run dev -- component list --project WEBSI
npm run dev -- comment list --on WEBSI-123
```

Using the built binary:

```bash
node dist/bin/huly.js auth status
node dist/bin/huly.js project get HULY
node dist/bin/huly.js issue get HULY-1
node dist/bin/huly.js teamspace list
node dist/bin/huly.js person list
node dist/bin/huly.js milestone list --project WEBSI
node dist/bin/huly.js label list
node dist/bin/huly.js component list --project WEBSI
node dist/bin/huly.js comment list --on WEBSI-123
node dist/bin/huly.js setup-skill
```

Create an issue:

```bash
npm run dev -- issue create \
  --project HULY \
  --title "CLI smoke test" \
  --description "Created by huly-cli"
```

Create a sub-issue:

```bash
npm run dev -- issue create \
  --project WEBSI \
  --title "Child task" \
  --parent WEBSI-123
```

Update an issue milestone:

```bash
npm run dev -- issue update WEBSI-123 --milestone "Sprint 1"
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

List or create labels:

```bash
npm run dev -- label list
npm run dev -- label create --title bug --color 11 --description "Bug reports"
npm run dev -- label assign WEBSI-123 --label bug
```

List or create components:

```bash
npm run dev -- component list --project WEBSI
npm run dev -- component create --project WEBSI --label Backend --description "Backend services"
```

List or add comments:

```bash
npm run dev -- comment list --on WEBSI-123
npm run dev -- comment add --on WEBSI-123 --message "Implemented in commit abc123"
```

Install the bundled agent skill:

```bash
npm run dev -- setup-skill
npm run dev -- setup-skill --dir /path/to/project --force
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

`--help` and `--version` also return JSON on stdout, matching the CLI's machine-readable output contract.

## Performance Notes

- Read-heavy commands avoid initializing transactional operations unless a write path is actually needed.
- The Node runtime uses the published Huly REST client plus transaction helpers, which avoids the browser-only WebSocket runtime path on modern Node releases.
- This keeps startup lighter for common read commands such as `project list`, `issue list`, and `member me`.
- `label list --project <identifier>` returns labels currently referenced by issues in that project, because Huly issue labels are workspace-scoped tags rather than project-owned records.
- Connection bootstrap now retries transient network failures with a short exponential backoff instead of failing on the first dropped request.
- The build clears `dist` and excludes test files from the published tarball, which keeps the package leaner.
- `setup-skill` is purely local filesystem work and ships the bundled skill markdown directly in the package.

## Implementation Notes

- Uses official published Huly packages, centered on `@hcengineering/api-client`.
- Issue creation follows Huly’s published sequence-and-rank workflow.
- Issue labels are implemented through Huly’s published `@hcengineering/tags` package and attached to issues as tag references.
- Components are implemented as tracker-scoped docs in the project space.
- Comments are implemented as `@hcengineering/chunter` chat messages attached to the parent object's `comments` collection.
- The packaged AI skill is bundled at `.claude/commands/huly.md` and can be installed into another project with `huly setup-skill`.
- Document content is stored through the explicit markup upload path, which now works for both `doc` content and issue descriptions.
- `removeDoc` is wired for issue deletion and passed live smoke tests, but broader verification across different Huly deployments is still pending.
- The current TypeScript/compiler setup is on the latest stable 5.9 line; `tsconfig` modernization for newer Node-specific compiler modes is a separate optimization step rather than a functional blocker.
