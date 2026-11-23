# Decision: move the CLI's engine host into adapters/workspace-engine-node

- Approval: Paperclip task HAL-14217, option 1 of Owen's plan, which Liam approved there on 23 Nov; Liam reviews the PR and signs this note there
- Kind: internal

The host-free engine of one workspace (`openLocalEngine`, its run connectors and the agents'
working folders) moves unchanged from `apps/cli/src` to the new package
`@halonicjs/adapter-workspace-engine-node`. The agent host's engine role can then open the same
engine as the CLI. Nothing the CLI does or says changes: its `cli-local-engine.ts` wraps the
shared engine as before, and its own tests of it stay in the CLI unchanged.

The tests of the moved files move with them, unchanged apart from their temporary folders' names
and the path to the Acme example:

- `apps/cli/src/local-run-connectors.test.ts` to
  `packages/adapters/workspace-engine-node/src/local-run-connectors.test.ts`
- `apps/cli/src/working-folders.test.ts` to
  `packages/adapters/workspace-engine-node/src/working-folders.test.ts`

So the CLI runs 7 tests fewer, all of them for `cli.local-engine`. The new package runs the same
7 tests, plus a new `local-engine.test.ts` with 6 tests of `openLocalEngine` itself, for
`cli.local-engine` and `cli.local-engine-lock`. (`program-folders.ts` and its tests no longer move
here: #5418 already moved them to `@halonicjs/adapter-program-copies-node`, which this package uses.)

## Covers

- cli.local-engine
- apps/cli/src/local-run-connectors.test.ts
- apps/cli/src/working-folders.test.ts
