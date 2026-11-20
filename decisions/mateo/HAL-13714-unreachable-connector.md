# Decision: `halonic tools review | approve` explain a connector that can't be reached

- Task: HAL-13714 (found in the real-run QA pass on HAL-13712)
- Approval: the task asks for this change; Liam split it from HAL-13670 on the task, reviews it and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Qv+MxdDXXJafaUeYLWlbUk7CcHbyRbaMwK3pt1NCuON9KWjKGwJWUXwJi4d8Ynz7WNf18KiXU7+nTb0TTiFDAQ==

## What changes

When `halonic tools review` or `halonic tools approve` can't list a connector's tools because it can't be reached, it stops with its own line and fix, exit 9 (`unavailable`), the same shape as the missing program and secret of HAL-13670:

- an `http` connector where nothing answers at its address (Node's network codes, such as `ECONNREFUSED` or `ENOTFOUND`, on the error or its cause): "Nothing answered at http://127.0.0.1:47998/mcp.", fix "Start its server, or change the address in library/connectors/notes-mcp.connector.yaml."; `--json` gets `reason` `nothing-answered` and `address`. The address leaves out a query or fragment, which can hold a token.
- a server that stopped, or didn't answer in time, before it listed its tools (`McpStoppedError`, Studio's `stopped`): "The notes-mcp server stopped, or didn't answer in time, before it listed its tools.", fix "Check that its server starts and works on its own, then try again."; `--json` gets `reason` `stopped`.

A missing program stays HAL-13670's (Liam's split on HAL-13714). The requirement `cli.commands.tools.connector-start`, new and unreleased in HAL-13670, gets one clause and two examples for these. Nothing it said before is removed or weakened. `revoke` doesn't list tools, so it is unchanged.

## Why

Before, both fell through to "Halonic ran into a problem it can't explain yet" with a link to report a bug, and exit 1. A server that isn't running is an everyday case, not a bug. Exit 9 is the CLI's code for "didn't answer or can't start". Any other MCP error, such as a server that answers with an HTTP 5xx, still shows as before.

The wording is new but small and builds on the approved `tools` output and HAL-13670's lines, so the team decides it (HAL-2282).

## Tests

No test was skipped or weakened. `connector-start.test.ts` gets three tests: nothing answering through `review` and `approve --all`, its `--json` without the query, and a server that stops before it answers. The fake servers can now stop before they answer, and the test HTTP client fails as Node's `fetch` does when nothing listens.

## Covers

- cli.commands.tools.connector-start
