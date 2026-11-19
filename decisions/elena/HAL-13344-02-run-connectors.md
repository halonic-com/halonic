# Decision: the runs' connectors move from the CLI into the engine, so the Studio's page starts them too

- Approval: Liam signs this on HAL-13344 (item 4 of HAL-13318, built on Owen's #3425 for HAL-11953)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Uyrk9vff9MqvaUJ1AbQ/2YeNEM1Wx/WkH5tqgA0PLzcH2bbA/qaoGKcagqcEuybBhOC/BN7lD+3nvB04KgzYCA==

`FolderRunConnectors` moves from `apps/cli/src/run-connectors.ts` to `@halonicjs/engine`
(`src/run/folder-run-connectors.ts`), so the Studio's page can start a run's connectors the way the
CLI does: it has no Node code, and the Studio can't import the CLI. Its test file moves with it, to
`packages/core/engine/src/run/folder-run-connectors.test.ts`. The cases and their expect calls stay
the same; only the tag changes from `cli.local-engine` to `engine.run-connectors`, the engine
requirement that says what the class does. So `cli.local-engine` counts fewer tests and expect
calls, and the guard sees the old test file as deleted. Nothing is weakened or skipped: the CLI's
own wiring (`local-run-connectors.test.ts`) stays tagged `cli.local-engine`.

## Covers

- apps/cli/src/run-connectors.test.ts
- cli.local-engine
