# Decision: the guard-notes entry point loads no npm package

- Approval: Liam asked for this fix on [HAL-5613](/HAL/issues/HAL-5613); the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-5613

## What changes

`guard-notes.yml` runs `tooling/check/src/cli/guard-notes.ts` from the base branch with no `pnpm install`.
Since HAL-5220 that entry point reached `@typescript/typescript6` through `source-files.ts` and
`verifies-calls.ts`, so every queue run crashed with `ERR_MODULE_NOT_FOUND`. The path checks
(`isSourceFile`, `isTestFile`) now live in `lib/source-paths.ts`, which imports nothing, and the
TypeScript parser is loaded only when a covered test file is parsed. `coveredPaths`, `noteSignedText`
and `signNote` became async because of that lazy load. A new test starts the entry point from a copy
of `src/` with no `node_modules`. No rule or signature format changed.

## Why

The job has to run the base branch's code without installing anything, or a pull request could change
what it runs. `guard-notes` can't become a required check (HAL-5221) while it crashes in the queue.

## Covers

- tooling/check/
