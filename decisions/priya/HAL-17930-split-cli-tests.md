# Decision: a package may run its tests as parts and merge them in `test`

- Approval: HAL-17930 (routed from the board's merge-time report on HAL-17891); Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:6nOA9oL9QyLZWfMEg+foijko7/pis/dDBzAf+aW0w9f11iaEDEawMrCC2Zcd6vv7uMPv/TSqtSbEezK2AFEWBQ==

## What changes

- The packages check (`tooling/check/src/lib/coverage.ts`) still requires a package's `test` script to be exactly `vitest run`, with one other exact form allowed: `vitest run --config vitest.merge.config.ts --merge-reports=test-results/blob`. No flags may be added to either.
- The CLI (`apps/cli`) uses that form. `test:part-1` and `test:part-2` each run half the test files with `--shard` and write a blob report. `test` depends on both parts and merges the reports.
- The CLI's `vitest.config.ts` runs its tests as two Vitest projects. `shared-modules` runs every file except the listed mock files with `isolate: false`, so the files in one worker share its module cache. `module-mocks` runs the files in `filesWithModuleMocks` (`apps/cli/src/test/module-mock-files.ts`), each in a fresh module cache. The root config has an empty `include`, because Vitest adds it to every project.

## Why

The CLI's one test task took about 235 s in CI and was the whole critical path of the apps-host shard. Most of that time is each file starting up, not the tests themselves, so two parts running at once roughly halve it. The split alone left each part at about 200 s, because the runner's 4 CPUs were already full. Sharing the module cache removes most of each file's start-up and brings each part to 108–109 s.

## Risk of sharing the module cache

- A test could depend on module-level state that another file left behind, so its result would depend on file order.
- A `vi.mock` or `vi.doMock` applies only if the module isn't loaded yet; in a shared cache an earlier file may have loaded it.

What keeps this in check:

- Files that mock a module run in their own fresh cache. `apps/cli/src/test/module-mock-files.test.ts` fails when a CLI test file calls `vi.mock` or `vi.doMock` and isn't in `filesWithModuleMocks`, or when the list names a file that doesn't.
- The shared preset restores env stubs, global stubs and mocks after each test.
- A review found no mutable module-level state in `apps/cli/src`; only constant sets.

## What stays guarded

- The coverage floor still comes from the shared preset: `vitest.merge.config.ts` builds on the package's `vitest.config.ts`, and both projects use the preset's settings. The merge checks the floor for both parts together.
- A part has no floor of its own, because half the tests can't meet it. The merge fails when a test file ran in neither part, so a missing part can't pass quietly.
- No test is removed or skipped: 2,171 tests in 281 files before and after; this PR adds one test file with one test (the mock-list guard).

## Tests

`tooling/check/src/test/coverage.test.ts`:
- the merge form passes, and the merge form with an extra `--coverage.enabled=false` fails;
- accepts the merge script with a merge config built on `vitest.config.ts`;
- rejects the merge script without a merge config;
- rejects a merge config that doesn't build on `vitest.config.ts`;
- rejects a merge config that turns coverage or its floor off.

`apps/cli/src/test/module-mock-files.test.ts`: the list of mock files matches the CLI test files that call `vi.mock` or `vi.doMock`.

## Covers

- tooling/check/
