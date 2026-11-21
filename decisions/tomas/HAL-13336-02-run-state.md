# Decision: the run state tests use real Durable Object storage, so the Node SQLite stand-in goes

- Task: HAL-13336
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13336 (the task asks to move adapter-cloudflare-durable's Node tests into workerd and drop their fakes; Liam reviewed this pull request on 19 Nov and approves this note in review on the task)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:w/jLGvPWdr0rQGgfGOaoZwEBf0lkysW9Ns9M/Q/12I5LSTAeHitEb7Xw0frBJQXBg2HDsOSzjIH87tlushvUDA==

## What changes

`packages/adapters/cloudflare-durable/src/node/node-sql.spec.ts` is deleted. It held no test: it was
`NodeRunSql`, a `RunSql` over Node's built-in SQLite in memory, so the run state, run object, run
watcher and durable scheduler tests could run in Node with coverage. The guard counts it as a test
file because of its `.spec.ts` name.

Those tests now run in workerd over a real Durable Object's `ctx.storage` (the `src/test/*.spec.ts`
cases this pull request adds), so nothing uses `NodeRunSql` any more. Every case keeps its name and
its checks, the package still has 174 tests, and no requirement loses a test or an `expect`.
Coverage from the package's run is 98.9% of lines and 93.5% of branches, over its floor of 90% / 85%.

## Why

A stand-in can differ from the real storage in ways the tests can't see. The real storage is the one
the adapter ships against, and the workerd harness now counts its coverage, so the stand-in only
adds code to keep in step.

## Covers

- packages/adapters/cloudflare-durable/src/node/node-sql.spec.ts
