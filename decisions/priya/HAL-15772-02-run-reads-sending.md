# Decision: CLI runs read the saved Allow sending choice

- Approval: /HAL/issues/HAL-15765 (decided by Liam, from C623); task HAL-15772, part 2
- Kind: user-visible
- Task: HAL-15772

## What changes

`halonic google allow-sending <connector> on` saved the choice, but the CLI's runs answered every sending check with a constant `sendingOff` ("the CLI can't switch it on yet"), a stand-in from before the settings store existed. So a Google connector's `send` tools stayed refused in `halonic run` after the command said "✓ Sending is on".

- cli.local-engine: "Sending shall be off for every connector, because the CLI keeps no connector settings yet" becomes: the choice saved with `allow-sending` for the workspace's real path and the connector, off without one. A refusal ends with the next step: the `allow-sending` command for a Google connector, and "the CLI can't switch it on yet" for any other. Settings that can't be read count as off, and their error goes to the host through `reportSettingsError`, never to the model.
- cli.commands.google.allow-sending: says that the runs of `run`, `runs send`, `serve` and `routines watch` read the saved choice, and what the refusal says while it is off. Two examples are added.

The engine still gets only the read side (`SendingSettings`). `openConnectionSettings` gives the same `ConnectionSettings` over the profile's `connections` folder that `allow-sending` writes, and the key is the same: the workspace's real path (`realpath`, the engine's `location`) and the connector's id. The engine checks again at every `send` call, after an OK and on a retry included, as `engine.run-connector-calls` already says.

## Why

Liam decided on HAL-15765 that ignoring the saved choice is a gap: the phase-4 plan and `cli.commands.google.allow-sending` treat the command as the way to switch sending on. Default stays off.

## Out of scope

Studio has no Allow sending switch yet, so its runs stay off. There is no way to switch sending on for a connector that isn't a Google one: a new command is a UX question for the board. For such a connector the refusal keeps saying the CLI can't switch it on yet.

## Tests

No test was weakened. The `cli.local-engine` test that expected the constant refusal now checks that the run asks the saved choices with the workspace's real path and adds the next step. `run-sending.test.ts` (new) covers: on for this workspace and off for another one, the Google fix line, the line for a connector that isn't a Google one, and an unreadable store whose error is kept for the host. The test constructors of `LocalRunConnectorsInput` pass `noSavedSending`, which is off for every connector, as before.

## Covers

- cli.local-engine
- cli.commands.google.allow-sending
- apps/cli/src/local-run-connectors.test.ts
