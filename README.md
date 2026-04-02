# huly-cli

`huly-cli` is a JSON-first command line client for the Huly Platform API, aimed at scripts, CI jobs, and AI agents that need predictable shell commands instead of ad hoc TypeScript snippets.

The project currently implements the PRD's Phase 1 command set plus several later slices. The long-term target remains broader API parity across Huly entities.

## Priorities

- Performance-first CLI execution
- Predictable JSON output for automation and AI agents
- Current stable TypeScript baseline and modern Node.js compatibility
- Compatibility with both Huly cloud and self-hosted deployments

## Implemented Scope

Current Phase 1 commands:

- `auth login|status|logout`
- `project list|get|create|update|delete`
- `issue list|get|create|update|delete|template list|get|relation add|relation remove|blocker add|blocker remove`
- `member list|me`

Additional implemented commands:

- `teamspace list|get|create|update|delete`
- `doc list|get|create|update|delete`
- `person list|get|create|update|delete`
- `milestone list|get|create|update|delete`
- `label list|get|create|update|assign|unassign|delete`
- `component list|get|create|update|delete`
- `chat list|get|create|update|delete`
- `chat direct get|create`
- `chat member list|add|remove`
- `chat message list|get|send|update|delete`
- `chat thread list|get|send|update|delete`
- `comment list|add`
- `board list|get|create|update|delete`
- `board status list`
- `board column list|get`
- `board card list|get|create|update|move|delete`
- `card types|type list|get|create|update|delete|role list|get|create|update|delete|list|get|create|update|move|delete`
- `drive list|get|create|update|delete`
- `drive activity`
- `drive folder list|get|create|update|delete|activity`
- `drive file list|get|create|update|delete|activity`
- `hr department list|get|create|update|delete`
- `hr employee list|get`
- `hr public-holiday list|get|create|update|delete`
- `hr request-type list`
- `hr request list|get|create|update|delete`
- `notification list|get|read|unread|archive|unarchive`
- `raw list|get|create|update|delete|add-collection`
- `recruit vacancy list|get|create|update|delete`
- `recruit applicant-status list`
- `recruit applicant list|get|create|update|move|delete`
- `recruit candidate list|get|create|update|delete`
- `recruit review list|get|create|update|delete`
- `recruit opinion list|get|create|update|delete`
- `time list|get|create|update|done|open|delete`
- `time report list|get|totals|create|update|delete`
- `setup-skill`

Current scope details:

- Implemented: `auth`, `project`, `issue`, `member`, `teamspace`, `doc`, `person`, `milestone`, `label`, `component`, `comment`, `board`, `card`, `chat`, `drive`, `hr`, `notification`, `raw`, `recruit`, `time`, `setup-skill`
- Remaining parity gaps are now narrower and mostly around deeper entity coverage inside the newly added Phase 5 modules, not complete absence of those namespaces.

Current `raw` scope:

- `raw` provides low-level document and attached-collection access for automation when a dedicated higher-level namespace is not available yet.

Current `time` scope:

- `time` currently manages issue-attached todos plus issue-attached `TimeSpendReport` entries through Huly's published time and tracker packages.
- Time-report CRUD plus `time report totals` are implemented and intended for automation-friendly logging and rollups against tracker issues.
- The current totals view returns overall hours plus issue, day, and employee groupings from the matching report set.
- `time list` now supports exact `--title`, exact `--priority`, and due-date range filters through `--due-date-from` / `--due-date-to`.
- `time report list` and `time report totals` now support exact `--description` plus numeric `--value-from` / `--value-to` filtering.
- `time update` now supports both `--clear-description` and `--clear-due-date` for todos, `time report update` supports `--clear-description` for report notes, and todo due dates follow the same ISO-8601 validation path as the rest of the CLI.
- Broader logged-time/reporting coverage from the long-term PRD is still pending beyond the current totals breakdowns.

Current `card` scope:

- `card` currently manages cards in Huly's default card space, custom card type CRUD, and attached role CRUD for workspace-defined types.
- Built-in card types remain readable but intentionally read-only. Custom `card type` and `card role` writes are smoke-tested live.
- Custom `card type create|update` now support `color`, `background`, and `removed` metadata on workspace-defined types, and `card type update` supports explicit `--clear-color` / `--clear-background` flows.
- Generic cards now support exact `card list --title`, parent assignment on create, parent changes through `card update --parent|--clear-parent`, root filtering through `card list --root`, readonly/editable filtering through `card list --readonly|--editable`, and sibling reordering through `card move --before|--after|--top|--bottom`.
- The smoke-tested card create/update/delete path still uses the generic `Card` type. Other workspace-specific card types are discoverable and targetable, but some may have stricter backend behavior.
- Broader card-schema work from the long-term PRD, such as arbitrary attributes and richer relation semantics beyond parent/rank workflows, is still pending.

Current `chat` scope:

- `chat` currently manages chat channels, direct-message lookup/creation, channel membership updates, chat messages, and thread replies attached to chat messages.
- Channel CRUD is smoke-tested. `chat list` now supports exact `--name`, `--member`, `--private`, `--public`, `--archived`, and `--active` filtering, plus `--channel` / `--direct` kind filters, and `chat update` supports explicit `--clear-topic` / `--clear-description` flows. Channel member list/add/remove is smoke-tested live with disposable channels. Message create and delete are smoke-tested. Message updates use bounded settle polling before returning, but fresh `chat message get` reads can still lag after an update on the Huly backend.
- Direct-message lookup/creation by member email is smoke-tested live. Thread reply list|get|send|update|delete is also smoke-tested live against disposable channels. Deeper chat coverage from the long-term PRD, such as richer nested-thread behavior, is still pending.

Current `issue` scope:

- `issue` now surfaces `estimation`, `remainingTime`, and `reportedTime` in issue output, and supports `--estimation` / `--remaining-time` on `issue create` and `issue update`.
- `issue list` now supports repeated `--status` filters plus `--date-from` / `--date-to` due-date filtering for broader tracker automation.
- Live smoke confirmed these fields round-trip, but Huly recalculates `remainingTime` when `estimation` changes. The CLI reports the backend result rather than pretending independent control over both fields.
- `issue` also surfaces relation/blocker ids and identifiers, derived child/template metadata, and supports `issue relation add|remove` plus `issue blocker add|remove`.
- `issue template list|get` is implemented for published tracker templates. Live reads against the current workspace returned empty lists, so template `get` remains verified only at the code-path level until real template data exists.

Current `milestone` / `label` / `component` scope:

- `milestone` now supports full CRUD within tracker projects, including direct `get` by id and verified live deletion of disposable milestones.
- `label` now supports full CRUD for issue labels plus `label unassign`, with delete removing attached tag references before deleting the label record.
- `component` now supports full CRUD with markdown description round-tripping and duplicate-label protection within a project.

Current `doc` / `teamspace` / `person` scope:

- `doc` supports list|get|create|update|delete within teamspaces, exact `doc list --title`, `--parent`, and `--root` filtering, parent assignment on `doc create --parent`, and hierarchy moves through `doc update --parent|--root`.
- Document create now uses bounded read-after-write polling before returning, because live smoke exposed backend lag when reading a freshly created doc immediately.
- Live smoke verified nested document hierarchy flows in a disposable teamspace, including parent create, root/parent/title filtering, moving a child doc back to root, and cleanup.

- `teamspace` now supports full CRUD with privacy/archive toggles, explicit description clearing, and exact `list` filters for `--name`, `--private`, `--public`, `--archived`, and `--active`. Live smoke verified create|get|update|delete plus the new list filters against disposable teamspaces.
- `person` now supports full CRUD with email-channel synchronization, exact `list` filters for `--name`, `--city`, and `--email`, plus `--clear-city` and `--clear-email` semantics on update. Live smoke verified create|get|update|delete, exact list filters, and attached email cleanup.

Current `board` / `drive` scope:

- `board` supports list|get|create|update|delete against workspace spaces, `board column list|get` as derived views of live card-status groupings, and `board card list|get|create|update|move|delete` for board-attached cards.
- Board create/get/update/list now round-trip the published `Board.color` and `Board.background` metadata in addition to name/description/privacy/archive fields, and board update supports explicit `--clear-color` / `--clear-background` flows.
- `board list` now supports exact `--name`, `--private`, `--public`, `--archived`, `--active`, and `--limit` filtering.
- Board-card writes use the verified attached-document path on `board.class.Board -> cards`, with markdown description support, published cover metadata (`cover.color` / `cover.size`), member employee refs, start/due date, location, archive-state updates, assignee round-tripping through person ids, status round-tripping through Huly status refs, and explicit rank-based reordering.
- `board card list` supports exact `--title`, exact `--location`, `--status`, assignee, member, and `--archived` / `--active` filtering, returns rank-ordered cards when scoped to a board, `board card create|update` support explicit status ids, assignee person ids, cover metadata, and comma-separated member employee ids, `board card update` clears cover/members/location/start-date/due-date through explicit flags plus Commander-safe `--no-*` handling, and `board card move` now supports before/after/top/bottom ordering plus optional status changes, including inheriting the target card status on cross-column moves.
- `board column list` groups current cards by status with friendly status/category names when the referenced model status exists, and `board column get --board ... (--status ...|--without-status)` returns one derived column plus a rank-ordered card sample for that column.
- `board status list` returns status ids currently used by board cards (optionally scoped with `--board`) with resolved names/categories plus card counts.
- `drive` supports both workspace drive spaces and lightweight folder/file record CRUD through backend document refs. File activity history is smoke-tested live with disposable resources and cleanup.
- `drive list` now supports exact `--name`, `--private`, `--public`, `--archived`, `--active`, and `--limit` filtering.
- `drive folder list` / `drive file list` now support exact `--title`, `--name`, and `--limit` filtering for lightweight record lookups.
- `drive update` now supports `--clear-description`, and `drive folder update` / `drive file update` now support `--clear-name` for lightweight record cleanup flows.
- `drive activity`, `drive folder activity`, and `drive file activity` read attached `activity:class:DocUpdateMessage` entries, which gives a safe verified history surface even though full drive-content/blob workflows are still not implemented.
- `drive` currently targets backend document refs directly because the drive npm package is not published on npm even though the backend namespace exists and is usable live.

Current `hr` scope:

- `hr` currently supports department CRUD, employee list|get, public-holiday CRUD, request-type list, and request list|get|create|update|delete.
- Public holiday CRUD uses the published HR package model in `core:space:Workspace`; create defaults to `hr:ids:Head` when `--department` is omitted, and public-holiday list now supports exact `--title` plus `--date-from`, `--date-to`, and `--limit` filtering. Request creation uses the correct attached-doc path and defaults to the current authenticated member when `--employee` is omitted. Request list now supports `--employee`, `--department`, `--type`, `--date-from`, `--date-to`, `--due-date-from`, and `--due-date-to`, with day-bucket comparisons that match Huly's `tzDate` behavior. Request update now supports `--clear-due-date`.
- Department update now safely clears parent and team lead through Commander-safe `--no-parent` and `--no-team-lead` handling. These flows were smoke-tested live against the current workspace, including request type resolution and cleanup.
- Department, public-holiday, and request update now support explicit `--clear-description` flows.

Current `notification` scope:

- `notification` supports `list|get|read|unread|archive|unarchive` for inbox notifications scoped to the current authenticated account.
- `notification list` now supports exact `--class`, `--object-class`, `--object-id`, and `--type` filters in addition to the existing `--read|--unread|--archived|--active` flags.
- Live smoke verified the new read-only filters against existing real inbox notifications without mutating company data.

Current `recruit` scope:

- `recruit` currently supports vacancy CRUD, applicant-status list, applicant list|get|create|update|move|delete, candidate list|get|create|update|delete, review list|get|create|update|delete, and opinion list|get|create|update|delete.
- Vacancy, applicant, review, and opinion writes use backend-validated payload shapes discovered through live smoke rather than guessed package-level abstractions. Vacancy update now round-trips `fullDescription` and supports `--clear-full-description`, `--clear-location`, and `--clear-due-date`. Vacancy list now uses backend exact-match filtering for `--name`, `--location`, `--private`, `--public`, `--archived`, and `--active`, including the archived-aware `showArchived` path required by Huly's list API. Review creation follows Huly's calendar-event payload requirements, and opinion CRUD uses the verified `Review -> opinions` attached collection path.
- Applicant statuses are resolved from the published recruit task type instead of hard-coded display labels, applicant summaries now expose `statusId` and `rank`, applicant list supports vacancy, exact `--identifier`, status, assignee, and unassigned filtering for lifecycle automation, and vacancy-scoped applicant ordering is rank-sorted when filtering by vacancy. Applicant update safely clears assignee/start-date/due-date through Commander-safe `--no-*` handling, and applicant move now supports `--before|--after|--top|--bottom` plus optional status changes while preserving same-vacancy safety. Candidate CRUD is implemented by creating/updating contact persons with the recruit candidate mixin; candidate list now supports exact `--name`, `--city`, `--title`, `--source`, `--remote`, and `--onsite` filters, review list supports exact `--verdict` and exact `--location`, opinion list supports exact `--value`, and candidate update supports clearing `city`, `title`, and `source` plus explicit `--no-remote` / `--no-onsite` toggles.
- Vacancy summaries now protect `applicantCount` against backends that return unknown totals by falling back to bounded count reads, so counts do not degrade to sentinel negative values.
- Review and opinion descriptions use the shared markup update path that was already fixed for other markdown-backed entities, so description create/update round-trips are verified live, including explicit `--clear-description` update flows. Review due dates remain settable but do not expose a clear flag yet, because a live null-update probe kept the previous backend value.

Verification snapshot:

- Local verification: `npm run build`, `npm test`
- Repeatable built-CLI verification:
  - Run `npm run build`, `npm test`, `npm run smoke`.
  - Prerequisites: valid auth via environment, local config, or `.env`, and a built `dist/` from `npm run build`.
  - `npm run smoke` runs against the current live workspace, uses disposable `cli-smoke-auto-*` resources, and cleans them up.
- Live verification: built CLI auth via token, project CRUD, teamspace/person CRUD plus exact list filters, clear flows, and cleanup, nested doc hierarchy create/list/update/delete flows in a disposable teamspace, milestone/label/component CRUD plus label assign/unassign cleanup, board column/status flows plus board list `--limit`, board-card title/location/archived-state filters, status-aware move flows, member filtering, and cleanup, card parent/move flows plus custom card-type `--clear-color` / `--clear-background`, chat channel exact name/member/kind/private/public/archived filters plus `--clear-topic` / `--clear-description`, drive list `--limit`, drive space/folder/file activity reads plus drive space clear-description, drive folder/file clear-name flows, and drive folder/file exact title/name list filters with cleanup, hr department clear-parent/team-lead plus clear-description flows, hr public-holiday title/date/limit plus clear-description flows, hr request clear-due-date plus clear-description flows, read-only notification class/object/type filters against the real inbox, recruit vacancy full-description plus private/public/archived/active filters and applicantCount validation, recruit applicant identifier/filter/clear/move flows, recruit candidate exact name/city/title/source/remote/onsite filters, recruit review verdict/location filters, recruit opinion value filters, recruit candidate/review/opinion CRUD including candidate clear/toggle flows and review/opinion clear-description flows with cleanup, `time list` title/priority/due-date-range filters, `time report list` description/value-range filters, `time report totals` description/value-range filtering, `time update --clear-description|--clear-due-date`, `time report update --clear-description`, and `time report totals` day-bucket aggregation with `--date-from` filtering
- The README reflects verified commands only. Broader PRD parity work is still in progress.

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
npm run dev -- chat list --include-direct --limit 10
npm run dev -- chat member list <chat-id>
npm run dev -- comment list --on WEBSI-123
npm run dev -- board card list --limit 10
npm run dev -- card list --type Card --limit 10
npm run dev -- notification list --unread --active
npm run dev -- time list --issue HULY-1
npm run dev -- time report list --issue HULY-1
```

Using the built binary:

```bash
node dist/bin/huly.js auth status
node dist/bin/huly.js project get HULY
node dist/bin/huly.js issue get HULY-1
node dist/bin/huly.js board card list --limit 10
node dist/bin/huly.js teamspace list
node dist/bin/huly.js person list
node dist/bin/huly.js milestone list --project WEBSI
node dist/bin/huly.js label list
node dist/bin/huly.js component list --project WEBSI
node dist/bin/huly.js chat list --limit 10
node dist/bin/huly.js chat member list <chat-id>
node dist/bin/huly.js comment list --on WEBSI-123
node dist/bin/huly.js card list --type Card --limit 10
node dist/bin/huly.js notification list --limit 10
node dist/bin/huly.js time list --limit 10
node dist/bin/huly.js time report list --limit 10
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

Create an issue with time metrics:

```bash
npm run dev -- issue create \
  --project WEBSI \
  --title "Tracked task" \
  --estimation 4 \
  --remaining-time 2.5
```

Update an issue milestone:

```bash
npm run dev -- issue update WEBSI-123 --milestone "Sprint 1"
```

Update issue time metrics:

```bash
npm run dev -- issue update WEBSI-123 --estimation 6
npm run dev -- issue update WEBSI-123 --remaining-time 1.5
```

List issue templates:

```bash
npm run dev -- issue template list --project WEBSI --limit 10
```

Create and complete an issue todo:

```bash
npm run dev -- time create \
  --issue HULY-1 \
  --title "Follow up from CLI" \
  --description "Created by huly-cli"

npm run dev -- time done <todo-id>
```

Create and update a time report:

```bash
npm run dev -- time report create \
  --issue HULY-1 \
  --value 1.5 \
  --description "Investigated and fixed the CLI path"

npm run dev -- time report update <report-id> --value 2 --description "Included verification"
npm run dev -- time report totals --issue HULY-1
```

Create a board card with a status and inspect columns:

```bash
npm run dev -- board create --name "CLI board"
npm run dev -- board card create \
  --board <board-id> \
  --title "Board task" \
  --status tracker:status:Todo
npm run dev -- board card list --board <board-id> --status tracker:status:Todo
npm run dev -- board column list --board <board-id>
npm run dev -- board card update <card-id> --status tracker:status:Done
npm run dev -- board card move <card-id> --top
npm run dev -- board card move <card-id> --after <other-card-id>
npm run dev -- board card update <card-id> --clear-status
```

Create and reorganize cards:

```bash
npm run dev -- card create \
  --title "Parent card"
npm run dev -- card create \
  --title "Child card" \
  --parent <parent-card-id>
npm run dev -- card list --parent <parent-card-id>
npm run dev -- card update <card-id> --clear-parent
npm run dev -- card update <card-id> --parent <new-parent-card-id>
npm run dev -- card move <card-id> --top
npm run dev -- card move <card-id> --after <sibling-card-id>
```

Manage channel members:

```bash
npm run dev -- chat member list <chat-id>
npm run dev -- chat member add <chat-id> --member teammate@example.com
npm run dev -- chat member remove <chat-id> --member teammate@example.com
```

Create a custom card type and role:

```bash
npm run dev -- card type create \
  --label "CLI Smoke Type" \
  --extends Card \
  --color 11 \
  --background 22

npm run dev -- card role create \
  --type <type-id> \
  --name "Blocks"
```

Create a chat channel and send a message:

```bash
npm run dev -- chat create \
  --name "cli-smoke-channel" \
  --topic "CLI smoke"

npm run dev -- chat message send \
  --chat <chat-id> \
  --message "Hello from huly-cli"
```

Create or fetch a direct-message chat:

```bash
npm run dev -- chat direct create --member teammate@example.com
npm run dev -- chat direct get --member teammate@example.com
```

Reply in a chat thread:

```bash
npm run dev -- chat thread send <message-id> --message "Thread reply"
npm run dev -- chat thread list <message-id>
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

Work with inbox notifications:

```bash
npm run dev -- notification list --unread --active
npm run dev -- notification get 69b6f98faf221468336cced8
npm run dev -- notification read 69b6f98faf221468336cced8
npm run dev -- notification archive 69b6f98faf221468336cced8
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
- Notifications are implemented as `@hcengineering/notification` inbox docs scoped to the current authenticated account.
- The packaged AI skill is bundled at `.claude/commands/huly.md` and can be installed into another project with `huly setup-skill`.
- Document content is stored through the explicit markup upload path, which now works for both `doc` content and issue descriptions.
- `removeDoc` is wired for issue deletion and passed live smoke tests, but broader verification across different Huly deployments is still pending.
- The current TypeScript/compiler setup is on the latest stable 5.9 line; `tsconfig` modernization for newer Node-specific compiler modes is a separate optimization step rather than a functional blocker.
