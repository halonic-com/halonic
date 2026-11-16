# Decision: the Worker parses the snapshot's routines once per version, not at every webhook delivery

- Task: HAL-11256
- Approval: the task asks for this change; Liam accepts the behaviour change in the task comment and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:QP6cKlPTBU2legRm+TNt2LfNdy4kFGOZf+BZHDfBA+o6R9a3tG7MWXYNaWVHiFcAN/pl1b2IFrpPu0l5IcxeAg==

## What changes

A webhook delivery on the Cloudflare Worker still reads the snapshot's version first. It parses the snapshot's routines only when the version differs from the one it holds, and keeps them for the next delivery in the same isolate. Before, every delivery loaded and parsed the whole workspace, even one with a wrong signature.

`requirements/serve.md` and the README said the routine is "read at every delivery". They now say that the snapshot's version is read at every delivery, and its routines are parsed again when the version changes.

## Why

An unauthenticated request with a bad signature cost a full workspace load, and anyone could repeat it up to the daily request ceiling. The checks of the shared webhook code are unchanged and still refuse the delivery.

A deploy that lands between reading the version and loading the workspace stores the newer routines under the old version, so the next delivery parses them again. The cache can't serve stale routines.

## Tests

No test was skipped or weakened. `snapshot-webhooks.test.ts` gains tests that count how often the snapshot is parsed across deliveries and after a version change.

## Covers

- packages/targets/cloudflare/runtime/requirements/
