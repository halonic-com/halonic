# Decision: codegen's Turbo inputs list only the files `pnpm discover` reads

- Task: HAL-18424 (item A of the CI speed list)
- Approval: Liam asked for this note on PR #6085 and signs it in review
- Kind: user-visible

## What changes

- `turbo.json`: the `//#codegen` task no longer hashes all of `tooling/check/src/**` and
  `tooling/discover/src/**`. Its inputs are now what the discover script imports:
  `tooling/check/src/index.ts`, `lib/**`, `rules/**`, `leaks/**` and three guard files
  (`decision-notes.ts`, `git-objects.ts`, `signatures.ts`), plus `tooling/discover/src/*.ts` and
  `tooling/discover/src/cli/discover.ts`. Test files are left out. The folder-discovery globs and
  the outputs stay as they were. The task now hashes 181 files instead of 294.
- New test `tooling/discover/src/codegen-inputs.test.ts`: it follows the discover script's imports
  from `cli/discover.ts`, including into `@halonicjs/tooling-check`, and fails if any of those
  files isn't a codegen input, or if an import names a file that doesn't exist.

## Why

Every typecheck, test and build depends on `//#codegen`, so a change to an unrelated check, guard
command or test file invalidated the whole Turbo cache after it. A narrower list risks Turbo
replaying a generated file built by old code; the test closes that risk by failing as soon as the
script imports a file the inputs don't cover. No test or requirement is weakened.

## Covers

- turbo.json
