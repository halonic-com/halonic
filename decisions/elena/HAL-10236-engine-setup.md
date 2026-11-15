# Decision: move the workspace model tests into the new adapter package

- Approval: Liam reviews this on the review task for PR 2a; the change is built in HAL-10236
- Kind: internal

The model resolver, the provider factory, the stop-to-abort helper and the default local addresses move from
`apps/cli` into the new package `@halonicjs/adapter-workspace-models`, so the CLI and the Studio app share them.
Their three test files move with the code and keep their tests and their `cli.workspace-models` requirement
tags. Nothing is weakened or skipped; the guard sees the old paths as deleted.

## Covers

- apps/cli/src/abort-on-stop.test.ts
- apps/cli/src/workspace-model-resolver.test.ts
- apps/cli/src/workspace-providers.test.ts
