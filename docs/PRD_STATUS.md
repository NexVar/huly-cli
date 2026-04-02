# PRD Coverage Status

This repository is not at 100% PRD parity yet.

## Current State

Implemented command groups:

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
- `drive file list|get|create|update|delete`
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

These cover the full Phase 1 command set plus broad coverage across the PRD's later module areas.

## What Is Still Missing

The largest remaining gaps are not missing namespaces anymore. They are deeper entity coverage inside the newer module families, especially:

- richer `board` entities beyond the now-implemented derived column detail and status-aware card move workflows
- richer `drive` semantics beyond the now-implemented clear/history flows on space docs and lightweight folder/file record docs
- richer `recruit` lifecycle-specific operations beyond the now-implemented vacancy/applicant/candidate/review/opinion CRUD
- any additional Huly entities that exist in backend packages but still need safe CLI surface design and live verification

## Verification Notes

Verified locally in this workspace:

- `npm run build`
- `npm test`
- live smoke through the built CLI for the implemented CRUD slices, including cleanup

Most recent live-smoked additions:

- `teamspace list|get|create|update|delete`
- `person list|get|create|update|delete`
- `milestone list|get|create|update|delete`
- `label list|get|create|update|assign|unassign|delete`
- `component list|get|create|update|delete`
- `board column list|get`
- `board card move` status-aware column transitions
- `drive update --clear-description`
- `drive folder update --clear-name`
- `drive file update --clear-name`
- `card list|get|create|update|move|delete` parent/rank workflows
- `board card update|move` clear and ordering workflows
- `hr department update` clear parent/team-lead
- `hr request update --clear-due-date`
- `recruit vacancy update` full-description and clear workflows
- `recruit applicant list|update` filter and clear workflows
- `recruit applicant move` rank/order and status-change workflows
- `recruit candidate update` clear/toggle workflows
- `recruit review update --clear-description`
- `recruit opinion update --clear-description`
- `recruit review list|get|create|update|delete`
- `recruit opinion list|get|create|update|delete`

## Bottom Line

The CLI is broadly usable across the implemented Huly domains and is well past the original MVP phases.

It is still not honest to call the PRD fully complete, because deeper parity work remains inside several extended modules.
