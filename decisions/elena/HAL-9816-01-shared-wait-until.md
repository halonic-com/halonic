# Decision: `waitUntil` moves to `@halonicjs/testing-spec`, with a deadline and a message

- Task: HAL-9816 (follow-up to HAL-9336)
- Approval: HAL-9816 asks for this change; Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:r8c1dYeuCYUO4HnMZVG0HSmHnWYn8cvQ7G4lBixQ5wwltlEpv5qpjP4vNPjGpXThR1NzAgkPYg91aDC6Hw8PDg==

## What changes

`waitUntil` had two copies: one in `apps/cli` (50 ms steps, 1 s limit) and one in the contract
suites (10 ms steps, no limit of its own). There is now one, in `@halonicjs/testing-spec`, so
every package can use it. Its first argument says what the test waits for, and a wait that
runs past the deadline (the test's `timeout`, else 1 s under `HALONIC_TEST_TIMEOUT` when CI sets it, else 4 s) fails with "Timed out after N ms waiting
for <that>." A new requirement, `spec.wait-until-checks-once`, covers it, with tests on fake
timers.

The two old copies are deleted and their call sites (five CLI test files, three contract
suites) now use the shared one and name what they wait for. The two small tests of the old
contracts copy are replaced by the six tests of the shared one, which also cover the promise
case, the already-true case and both timeouts. No test checks less than before, and the `expect`
count of every touched requirement stays the same.

The CLI waits now poll every 10 ms instead of 50 ms, and give up after 4 s by default instead of 1 s.

## Why

The remaining `vi.waitFor(() => expect(...))` sites in the engine, Studio, adapters and other
packages need the same helper, and a package can't import another package's test helper. The
contracts copy never gave up on its own, so a stuck wait only ended at the test's timeout, with
a message that did not say what was missing.

## Covers

- cli.commands.routines.watch
- cli.commands.serve.harness
- cli.commands.serve.serve
- cli.run
- cli.workspace-file-problems
- contracts.host-settings-store
- contracts.llm-provider
- contracts.llm-stream
- contracts.scheduler
- packages/testing/contracts/src/wait-until.test.ts
- packages/testing/spec/
