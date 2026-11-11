# Decision: the guard-notes entry point loads no npm package

- Approval: Liam asked for this fix on [HAL-5613](/HAL/issues/HAL-5613); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:9wHatYjqCyNdeHCkUHkBgzoVOCks5dzY1Vh/UVD5F0otVXHtBdKLNy643+qnvPafE3qc4FvCFQGHiCBkg348Dg==
- Task: HAL-5613

## What changes

`guard-notes.yml` runs `tooling/check/src/cli/guard-notes.ts` from the base branch with no `pnpm install`.
Since HAL-5220 that entry point reached `@typescript/typescript6` through `source-files.ts` and
`verifies-calls.ts`, so every queue run crashed with `ERR_MODULE_NOT_FOUND`. The path checks
(`isSourceFile`, `isTestFile`) now live in `lib/source-paths.ts`, which imports nothing. The guard no
longer parses test files to find the tests a note covers: `coveredPaths` takes every test file at the
head that names a covered requirement ID as a quoted string. That is a superset of the files that call
`verifies()` with the ID, and `pnpm decision` uses the same function, so the signed text still
matches. The set of covered files can grow, so an open pull request with a signed note that covers a
requirement ID needs a new signature. Two new tests start the entry point and `coveredPaths` from a
copy of `src/` with no `node_modules`. No rule or signature format changed.

## Why

The job has to run the base branch's code without installing anything, or a pull request could change
what it runs. `guard-notes` can't become a required check (HAL-5221) while it crashes in the queue.

## Covers

- tooling/check/
