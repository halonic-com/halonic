# Decision: tighten the runtime export format after its reviews

- Task: HAL-7352 (follow-ups from the reviews of PR #2131: HAL-7188, HAL-7189, HAL-7190)
- Approval: the task [HAL-7352](/HAL/issues/HAL-7352) asks for this change; the maintainer (Liam) approves this note in review
- Kind: internal

The reviews of the runtime export format (HAL-6700, PR #2131) left points
that didn't block the merge. This change makes them, in the active
requirement `format.runtime-export`, the code and its tests. Nothing reads or
writes an export yet, so no export that exists today stops passing.

Two rules are new. The manifest lists its files in byte order of their path,
so two exports of the same data list their files the same way. `exportedAt`
must be a date and time that exist: month 13, 30 February and hour 24 now
fail where before only the shape was checked. Neither rule shows in the JSON
Schema, so `spec/runtime-export.schema.json` doesn't change.

The rest is wording. Record file names are hashed from the collection name in
UTF-16LE, so outside readers get the byte order right. The requirement says
that tool approvals, trust and settings are left out on purpose; that runs are
kept per deployment but records and blobs per workspace, and that `halonic
serve` isn't built yet, so the export step decides which records and blobs an
export carries. It says that the schema keeps the secret *stores* out, not
every secret: a secret a run handled can still be in a run log, and scanning
the contents is HAL-7193. The test that keeps the YAML parser out now also
sees `import "…"`, `import("…")` and `require("…")`.

The note of HAL-6700 says "a secret or sign-in token has no place in an
export". It stays as it was signed; this note corrects it to the stores of
secrets and sign-in tokens.

## Covers

- format.runtime-export
