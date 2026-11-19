# Decision: count the live suite package as a cloud path

- Task: HAL-13745 (found on HAL-13741, under HAL-13615)
- Approval: the task asks for this change; Julian signs this note in review on HAL-13745
- Kind: internal

## What changes

- `packages/testing/cloudflare-live/` is a cloud path, so a change to the live suites themselves (their setup, fixtures and live tests) runs them before it merges.
- Requirement `check.cloud-affected` lists the live suites among the cloud paths and gains an example for them. Nothing is retired or weakened: the list only grows.

## Why

The live suites were not a cloud path, so a pull request that changed only them printed `affected=false` and skipped the live run. That is how the `import.meta.resolve` break in the live setup passed the pull request that introduced it and then failed every cloud pull request after it.

## Effect on other pull requests

Whether a pull request runs the live suites still depends only on its own changed files matching a pattern, so no unrelated pull request starts running them. The inputs hash (which decides when an earlier pass is reused) now also covers `packages/testing/cloudflare-live` and its one workspace dependency that wasn't covered yet, `tooling/publish`. Every other workspace dependency of the package was already an input through the targets and adapters.

## Tests

`cloud-paths.test.ts` answers yes for two files in the package and still answers no for `packages/testing/spec`.

## Covers

- tooling/check/
- check.cloud-affected
