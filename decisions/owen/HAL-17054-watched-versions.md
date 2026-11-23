# Decision: the watch's version tests move with WatchedVersions into the workspace engine

- Approval: Paperclip task HAL-17054 (plan approved by Liam on HAL-17049); Liam approves this note in review on HAL-17054
- Kind: internal

`WatchedVersions` moves from the CLI into `@halonicjs/adapter-workspace-engine-node` (HAL-17054), and the CLI's `apps/cli/src/commands/routines/watch-versions.ts` becomes a thin wrapper that words the engine's refusals. Tests move with the code they test, as the approved plan says:

- 7 tests in `apps/cli/src/commands/routines/watch-versions.test.ts` that check what a version passes and when (grants, the kept load, local only, agent and skill files, a child run's version) move, with the same steps and assertions, to `packages/adapters/workspace-engine-node/src/watched-versions.test.ts`, still under `cli.local-engine`.
- The CLI file keeps the tests that check the CLI's words for a refusal: local only changed, a missing skill, and a run without a version. That is why fewer tests run there (3, was 10).
- The adapter adds tests under the new `workspace-engine-node.version-refusals`, for each typed refusal.

Nothing is weakened: every moved assertion still runs, now against the engine's class, and every sentence the CLI says is still checked in the CLI.

## Covers

- apps/cli/src/commands/routines/watch-versions.test.ts
