# Decision: verifies() counts only the passing vi.waitFor attempt's expect calls

- Task: HAL-6453 (step 2 of HAL-6369)
- Approval: Liam wrote this pull request, so Julian approves the note in review on HAL-11623
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:zesJzkgMCWiBsAS/rxkiUDEydcPmXXV6GxWiNQO3kaz7UQTmJ6hn88MC1ANtUSHG6caoYasPe1M9fnVIhFPWCQ==

## What changes

- Inside `verifies()`, `vi.waitFor` is wrapped for the length of each test: the test's `expect` count keeps only the calls of the attempt that passed, as if the callback ran once. The original `vi.waitFor` is put back after the test. `expect.poll` already counts once and is unchanged.
- New requirement `spec.verifies-counts-retries-once` with three examples (a sync callback, an async callback, `expect.poll`), each verified in `verifies.test.ts`.

## Why

`vi.waitFor` runs its callback again until it passes, so the expect count `verifies()` records depended on runner speed. The requirement guard compares that count with the base commit's, so a slow runner could fail a pull request that changed nothing (HAL-6369, HAL-8866). Tests outside `verifies()` and tests without `vi.waitFor` count as before. Once this is on `main`, a second pull request removes the guard's `vi.waitFor` exception from halonic#1982.

## Covers

- packages/testing/spec/
- spec.verifies-counts-retries-once
