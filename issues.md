# Open Issues

## 1. `raw upload-markup` standalone roundtrip semantics are ambiguous

Status: open
Severity: medium

Observed behavior:

- `raw upload-markup` successfully returns a markup ref for an existing markup-backed document field.
- Existing high-level and raw `$markup` create/update flows are verified live and work correctly.
- A same-field standalone `raw fetch-markup` roundtrip against an already-populated document field did not reliably return the newly uploaded content during live smoke.

Why this matters:

- The command is exposed for platform-client completeness.
- The current API behavior suggests `uploadMarkup` may be a lower-level primitive than a full document-field mutation on existing markup-backed docs.
- If we want stronger standalone semantics, we may need an architectural decision about whether the CLI should keep exposing bare `upload-markup` as a primitive, or wrap it in a higher-level “upload and attach” workflow.

Current mitigation:

- Generic markup reads are verified through `raw fetch-markup`.
- Generic markup writes are verified through raw `$markup` payloads on `create|update|update-collection|create-mixin|update-mixin`.
- The repeatable smoke suite covers the verified read path and the verified `$markup`-based write paths.
