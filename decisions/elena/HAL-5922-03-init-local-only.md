# Decision: a new workspace starts local only

- Approval: the accepted ADR `docs/adr/2026-11-08-local-first.md` ("A new workspace starts with `privacy.localOnly: true`") and Liam's decision on [HAL-5921](/HAL/issues/HAL-5921) that the code follows it; Liam approves this note in review on [HAL-5922](/HAL/issues/HAL-5922)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:s3EIPrDGOJWmihoQXJ8Pa9Ikbj7W/ZNPNE9DbPwwwZ9etdhHlBtBEHq2n+Sp/7lDUwxEh366bftF0H5Yh+PzBA==
- Task: HAL-5922

## What changes

`workspace.init` now writes `privacy.localOnly: true` into the new `workspace.yaml`, so
`halonic init` (and Studio, which uses the same function) makes a local-only workspace. The
`examples/acme` workspace that `halonic init --example acme` copies gets the same block. The
schema default stays `false`, so a workspace without a `privacy` block reads as before.

## Why

The ADR's decision is that a new workspace starts local only. The engine now enforces the
setting (HAL-5922 parts 1a and 1b, and HAL-6125 for harness agents, all merged before this
change): with it, Halonic uses only local models and connectors and refuses agents that run in a
harness program, and `halonic validate` reports each of those. Writing the setting therefore
keeps what it promises, and no more than requirement `engine.local-only` says.

## Tests

The two expectations of the exact `workspace.yaml` text in
`packages/core/workspace/src/init-workspace.test.ts` gain the `privacy` block. Nothing is
removed; the test still loads the new workspace and expects no issue.

`apps/cli/src/local-engine-host.test.ts` copies `examples/acme` and adds an `https` mail
connector to check that a tool under `approve` is refused. A local-only acme never offers that
connector, so this one test sets `privacy.localOnly: false` in its copy. Its expectation is
unchanged.

## Covers

- workspace.init
- packages/core/workspace/src/init-workspace.test.ts
