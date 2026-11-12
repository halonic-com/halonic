# Decision: the stdio connector checks the harness agents' working folders before it starts

- Approval: the plan on HAL-4759, from Julian's conditions on HAL-4739; Liam approves this note in review of the pull request, after Julian's security check
- Kind: internal
- Task: HAL-4759

## What changes

- `ConnectorFactoryContext` gains the optional `workingFolders`: the absolute working folder of
  every harness agent in the workspace, as real paths, given by the caller. Optional, so
  `connectorClientVersion` stays 1.
- `mcp.stdio-connector` gains one clause: the connector passes those working folders, when
  there are any, with the launch, for pinned and unpinned connectors alike.
- `mcp.program-starter` gains one sentence and one example: the Node starter refuses a launch
  that `format.working-folder-start` finds reaching a working folder, before anything starts,
  and checks again with the program as it found it on `PATH`. Like the skill `scripts/` check
  since HAL-4777, it reads only the `env` values the connector file sets (`checkedEnv`), not
  the app's own variables or the secret values: those aren't workspace content, and a piece of
  a secret value must never appear in the refusal message.

## Why

A harness agent writes in its working folder from inside the sandbox, but a local connector's
program runs outside it, with the connector's secrets. The static check
`workspace.working-folders` only sees paths as written. The check on the real file system
(symbolic links, short names, the program on `PATH`, `node_modules` links and files loaded
from next to a script) landed in `@halonicjs/format` with halonic#1536. This change calls it
where a stdio connector's program starts, in the same place as the skill `scripts/` check.

With no working folders nothing changes, which is the case on `main` today: the engine passes
them once a harness agent's `workingFolder` is wired into runs (stack 4b of HAL-189).

## Covers

- mcp.program-starter
- mcp.stdio-connector
