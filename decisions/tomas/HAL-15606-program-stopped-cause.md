# Decision: a run says a connector's program stopped right after it started

- Approval: Liam approves this change on HAL-15606 (https://paperclip.halonic.com/HAL/issues/HAL-15606), from flow check C600 (#1a and #8) on HAL-15594. The words are `halonic tools review`'s own, approved on HAL-13731 and HAL-13732; a team decision with no board card (HAL-2282 rule).
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:cuJTW2+y0bwqD/ruoBfP2dEnukM2yadgShgjq7wmwez3iMVyhVE6Ir10M7edBHbjFIJecL10aAWBh46nsjzhCw==

## What changes

A connector whose program stops by itself right after it starts (`sh -c "…; exit 3"`) made
`halonic run` warn "! boom couldn't list its tools, so they are off in this run." and send the
person to `halonic tools review boom`, which then said the program stopped and how to see why. The
run log had `why: "other"`, because the engine's reader only knew a missing program, a missing secret
and the plugin reasons.

- `ProgramStoppedAtStartError` (`@halonicjs/adapter-mcp`) gets its own `name`, so the ports reader,
  which reads errors by name and field, can tell it apart. `McpError`'s `name` is typed `string` for
  that; every other MCP error keeps the name `McpError`.
- The sandboxed stdio connector (`@halonicjs/adapter-connector-stdio-sandbox`, used by `halonic run`
  and Studio's agent host when the sandbox runs) threw a plain `McpStoppedError` for the same case.
  It now throws `ProgramStoppedAtStartError` too, unless the sandbox session itself ended, which
  still wins (`connector-stdio-sandbox.session-ended`).
- `connectorStartFailureOf` gives `program-stopped` with the program's name; the events package adds
  `program-stopped` to the connector-start reasons; the engine logs it with the name, as it does for
  a missing program. Never the program's output.
- `halonic run` and `halonic runs show` say "! boom didn't start, so its tools are off in this run.",
  "The program sh stopped right after it started." and `tools review`'s fix, "To see why, run the
  command and args from library/connectors/boom.connector.yaml yourself."
- Studio's run view has no words of its own for it yet and reads it as a connector that didn't start,
  as before (C600 #1c follows separately).
- C600 #8: the `tools review | approve | revoke` usage says `<connector>` instead of `<source>`, as
  their refusal ("needs a connector's id") and help do. The two usage goldens and the requirements
  that quote the usage change with it; `--json` keeps its `source` field.

## Tests

No test is removed or weakened. `stdio-restart.test.ts` expected the name `McpError` for a program
that crashes at start; it now expects `ProgramStoppedAtStartError`, the more exact name. New tests:
the sandboxed connector, the reader, the engine's cause, the events reader, and a real `halonic run` whose connector's program
exits at start, which also checks that nothing the program wrote reaches the terminal.

## Why

The program's reason is the person's next question, and `run` already gives cause and fix for a
missing program or secret. Saying it in the run saves the second command. Showing the program's own
error output (C600 #1b) is a separate decision about secrets in that output, asked on its own task.

## Covers

- mcp.connector-start-errors
- connector-stdio-sandbox.workspace-connector-start
- ports.connector-start-failure
- events.tool-result-cause
- events.connector-listing-failed
- engine.connector-listing-failed
- engine.tool-result-cause
- cli.run-connector-warning
- cli.commands.tools.review
- cli.commands.tools.approve
- cli.commands.tools.revoke
- cli.commands.tools.integration-connector
- cli.commands.tools.plugin-connector
- apps/cli/src/commands/tools/golden/usage-fingerprint-all.txt
- apps/cli/src/commands/tools/golden/usage-fingerprint-many.txt
