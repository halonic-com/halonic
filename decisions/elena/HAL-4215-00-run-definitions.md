# Decision: `runDefinitionsOf` and its tests move from the CLI into core/workspace

- Approval: Liam's review of the test runner plan on [HAL-4224](/HAL/issues/HAL-4224) ("Move
  `runDefinitionsOf` from `apps/cli` into `core/workspace` … together with its tests"); the
  maintainer approves this note in review
- Kind: internal
- Task: HAL-4215

## What changes

`runDefinitionsOf` moves from `apps/cli/src/local-engine-host.ts` into
`packages/core/workspace/src/definitions.ts`, next to `definitionsOf`, so `halonic run` and the
test runner build a new run's definitions the same way. Behaviour stays the same.

`cli.local-engine` no longer describes what a new run starts with, nor the `RangeError` for a
workflow the hub doesn't have. It now points to the new requirement `workspace.run-definitions`,
which says both, with the same examples. Its example for the `RangeError` moves there as well.

## Tests

No test was weakened. The two tests of `runDefinitionsOf` in
`apps/cli/src/local-engine-host.test.ts` move to `packages/core/workspace/src/definitions.test.ts`
under `workspace.run-definitions`, with the same checks: the workflow, the hub's agents, workflows,
collections and knowledge, and the `RangeError` that names the hub and the workflow. A third test
adds a hub the workspace doesn't have.

## Covers

- cli.local-engine
- apps/cli/src/local-engine-host.test.ts
