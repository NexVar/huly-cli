# PRD Coverage Status

This repository now satisfies the PRD's command/API parity goal.

## Current State

Implemented dedicated command groups:

- `auth login|status|logout`
- `project list|get|create|update|delete`
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
- `board status list`
- `board column list|get`
- `board card list|get|create|update|move|delete`
- `card types|type list|get|create|update|delete|role list|get|create|update|delete|list|get|create|update|move|delete`
- `chat list|get|create|update|delete`
- `chat direct get|create`
- `chat member list|add|remove`
- `chat message list|get|send|update|delete`
- `chat thread list|get|send|update|delete`
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
- `recruit vacancy list|get|create|update|delete`
- `recruit applicant-status list`
- `recruit applicant list|get|create|update|move|delete`
- `recruit candidate list|get|create|update|delete`
- `recruit review list|get|create|update|delete`
- `recruit opinion list|get|create|update|delete`
- `time list|get|create|update|done|open|delete`
- `time report list|get|totals|create|update|delete`
- `setup-skill`

Generic parity surface:

- `raw list|get|create|update|delete`
- `raw add-collection|update-collection|remove-collection`
- `raw create-mixin|update-mixin`
- `raw fetch-markup|upload-markup`

## Why This Counts As PRD Complete

The PRD requires full entity/operation reachability through the official Huly platform client. That requirement is now met by:

- dedicated first-class commands for the major user-facing Huly domains
- generic raw commands that expose the remaining platform-client document, collection, mixin, and markup operations
- markup-aware raw JSON payload support for generic create/update paths

Dedicated ergonomic coverage can still grow in the future, but it is no longer required for PRD completion because the raw surface closes the remaining API-operation gap.

## Verification

Fresh verification completed in this workspace:

- `npm run build`
- `npm test`
- `npm run smoke`

Fresh live smoke coverage includes:

- isolated token auth `login|status|logout`
- member `list|me`
- project CRUD
- issue relation/blocker mutations plus comment add/list
- label CRUD plus assign/unassign
- milestone CRUD
- component CRUD
- time todo CRUD and time-report CRUD/totals
- teamspace/document CRUD plus raw markup fetch/upload coverage on document content
- person CRUD
- raw drive folder CRUD
- raw collection add/update/remove lifecycle
- raw mixin create/update lifecycle
- cleanup of disposable smoke-created resources

## Remaining Note

One low-level platform semantic issue remains documented in [`issues.md`](/home/batuhan4/github/huly-cli/issues.md):

- standalone `raw upload-markup` returns a ref, but same-field standalone roundtrip semantics on existing markup-backed docs remain ambiguous in live verification

That issue does not block PRD command/API parity because generic markup reads are verified, generic markup writes are verified through `$markup` on create/update paths, and the raw standalone upload command is exposed for completeness.
