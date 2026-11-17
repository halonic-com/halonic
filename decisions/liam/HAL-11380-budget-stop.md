# Decision: the CLI and the Studio pass the workspace's budget to their engine

- Approval: HAL-11391. Liam wrote this pull request, so Owen approves the note in review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Z2gP5Q3QWEw8ujMlsWIYd7FQydRNq9Mz1TjOZ9EXvJeApVHcXyq1NGhTjjdCLCDiHst+6Fzzy5EFYWJGZpbjDw==
- Task: HAL-11380

## What changes

- `cli.local-engine` adds the workspace's budget to its source and one example: a run on a priced test model whose monthly budget in `workspace.yaml` is used up fails with the reason `budget` before its next model call.
- `studio.engine-service` (draft) gets the same source and an example: the engine opened on a workspace keeps to its `workspace.yaml` budget, and to none when the budget sets only a currency.
- Both hosts pass `workspaceBudget(latest)` from `@halonicjs/adapter-workspace-models` as `LocalRunsOptions.budget`. The CLI reads it from the version it read last; the Studio from the workspace loaded when its engine opened, so a budget changed in the Studio counts from the next engine open, as its run definitions do.

## Why

`engine.budget-stops` (HAL-5206) only fires when the host passes a budget, and neither host did, so a budget in `workspace.yaml` never stopped a run. Nothing is taken away: a workspace without a `perRun` or `monthly` budget runs as before.

## Covers

- cli.local-engine
- studio.engine-service
