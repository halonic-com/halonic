# Decision: two starters' reasons in process-starters.json name the shared program lookup

- Task: HAL-3976 (plan phase 3 on HAL-191: "the Windows start path resolves commands to absolute paths, with no shell")
- Approval: the task asks for this reason update; Liam approves this note in review on [HAL-3976](/HAL/issues/HAL-3976)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:DKvachlMcj3/FYQ2Ty+v1bGamXUHhXdul3dNMTEt3QQ25FJQGZwqnY8AFEsAgHkbvPMg9oewwbwuhMjatv50Cw==

## What changes

`tooling/check/process-starters.json` changes two reasons, and nothing else:

- `packages/adapters/mcp/src/stdio/node-program-starter.ts` now starts the absolute path `findProgram` resolved from the absolute folders of the connector's `PATH` (never the current folder; on Windows only an `.exe`), instead of the bare name.
- `packages/adapters/sandbox-host/src/program-probe.ts` says it starts only the path `findProgram` resolved, with the same rules.

No starter is added or removed, and both keep their `scriptsTest`.

## Why

The process-starts guard's reasons say what each starter may start. Both starters now hand `spawn` an absolute path from the shared lookup in `adapter-system-node`, so the reasons say so. Before, the MCP starter gave Windows the bare name, and Windows searches the current folder (the workspace) first.

## Tests

No test was weakened or skipped. The MCP starter gains three tests. Two of them (a program found only through `.` in its folder, and a `PATH` folder under a skill's `scripts/` folder) fail on the old starter.

## Covers

- tooling/check/
