# Decision: runs show's failed-run tests move into their own file

- Approval: Liam asked for this split on HAL-6722, the review task of HAL-6613, and approves this note there
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:8bhVatDSElMK1ZV+9ngfdRvizjCT+W0ZjxFrHT1mZ1i/D85UpFeTf8a3mTOPZD9ZMZj+okjOHlv7s83P9s6nDQ==

## What changes

`apps/cli/src/commands/runs/show.test.ts` loses its `describe("a failed or
stopped run")` block. The block moves unchanged, with its Mail triage fixture,
to `apps/cli/src/commands/runs/show-failed.test.ts`, under the same
requirement, `cli.commands.runs.show`. So `show.test.ts` runs fewer tests, but
no test is removed or weakened: the requirement runs as many tests with as
many `expect` calls as before.

## Why

With the `--debug` tests of this pull request and the show tests that `main`
added meanwhile (#2090, #2037), `show.test.ts` had 521 lines, over the
500-line limit. A failed, couldn't-try or cancelled run is a concept of its
own, with its own fixture, so it gets its own file.

## Covers

- apps/cli/src/commands/runs/show.test.ts
