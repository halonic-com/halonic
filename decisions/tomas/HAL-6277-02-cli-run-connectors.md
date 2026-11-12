# Decision: the CLI's runs start their own connectors, in their program folder

- Requirements: `cli.local-engine` (`apps/cli/requirements/local-engine.md`)
- Task: HAL-6277, PR B1 (conditions from Liam on HAL-6290)
- Approval: Liam approves this note in his review of this pull request on
  [HAL-6277](/HAL/issues/HAL-6277)
- Kind: internal

## What changes

`cli.local-engine` said that in 0.1 the engine offers no connectors. Now each top-level run of
`halonic run`, `halonic runs send` and `halonic routines watch` starts the connectors its hub can
see, through the engine's `RunConnectors` port (#1969, `engine.run-connectors`):

- They start in `programFolders.folderFor(version)`: a copy of the workspace at the run's commit
  for a live run, the workspace folder for the saved files. So a connector's script that was
  saved but isn't live never runs in a live run (`app.runs-read-latest-version`).
- They start with the grant from the command's trust check, which `checkRunTrust` now returns.
  A run that can only reach the test model has no grant, so no program starts.
- They are closed, and the copy released after them, when the run ends or the engine closes.
- Sending is off for every connector: the CLI keeps no connector settings yet. Only tools
  labelled `send` are affected; other calls work as before, with a person's OK where the
  connector file asks for one.
- An engine over the versions of a workspace (`versions`, HAL-6084) starts no run's connectors
  yet: its runs' connector files may be of another version than the one it read last. No command
  passes `versions` today.

A chat turn still calls the connectors it is given, none by default.

Harness agents stay refused in `halonic run` (HAL-6476). Wiring them comes in B2a-2.

## Tests

No test was weakened. `live-version-programs.test.ts` now goes through the CLI's engine: a run of
the live version calls a real MCP program, and the committed script answers, never the saved
change; afterwards no copy is left. Run on the saved files, the same test gets the saved script,
so it can fail. `run-connectors.test.ts` has 8 unit tests: one start per run, a copy per run, the
workspace folder for the saved files, close before release, a failed close is reported, no version
starts nothing, a connector that can't be created releases the copy and is tried again, and the
engine's close ends every run. `local-run-connectors.test.ts` has 2: sending is off with its reason,
and an engine over several versions starts no run's connectors.

## Covers

- cli.local-engine
