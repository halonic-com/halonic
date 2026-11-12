# Decision: the CLI's runs start their own connectors, in their program folder

- Requirements: `cli.local-engine` (`apps/cli/requirements/local-engine.md`)
- Task: HAL-6277, PR B1 (conditions from Liam on HAL-6290)
- Approval: Liam approves this note in his review of this pull request on
  HAL-7171
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:RjXPE1D7itTVRTQ1HOpqGsDKQ+dRoVh2l1Em1RkybXs/3hddmNiw6fbeAk4LYvZBb9R6xVgQ4pQFz1C8D9KPDw==

## What changes

`cli.local-engine` said that in 0.1 the engine offers no connectors. Now each top-level run of
`halonic run` and `halonic runs send` starts the connectors its hub can see, through the engine's
`RunConnectors` port (#1969, `engine.run-connectors`). `halonic routines watch` gets the same
wiring, but starts none yet (see the last point):

- They start in `programFolders.folderFor(version)`: a copy of the workspace at the run's commit
  for a live run, the workspace folder for the saved files. So a connector's script that was
  saved but isn't live never runs in a live run (`app.runs-read-latest-version`).
- They start with the grant from the command's trust check, which `checkRunTrust` now returns.
  A run that can only reach the test model has no grant, so no program starts.
- Each connector is marked local or not, as `connectorIsLocal` reads its file. A run of a
  local-only workspace starts only the local ones, so the engine (`engine.local-only`) keeps
  them, and skips the others before they are created.
- Each start is refused the harness agents' working folders, both in its copy and in the real
  workspace, where the agents write (`format.working-folder-start`).
- They are closed, and the copy released after them, when the run ends or the engine closes.
  Once the engine has closed, no run starts a connector. A connector that fails to close, or a
  leftover copy that can't be swept, is a `--debug` line only: it is clean-up, so it never
  counts toward a stuck run and never stops the command, not even a `routines watch` that runs
  for days (HAL-7171).
- The command passes its trust grant to the setup that builds the runs' connectors, so a test
  can check which grant they get.
- Sending is off for every connector: the CLI keeps no connector settings yet. Only tools
  labelled `send` are affected; other calls work as before, with a person's OK where the
  connector file asks for one.
- An engine over the versions of a workspace (`versions`, HAL-6084) starts no run's connectors
  yet: its runs' connector files may be of another version than the one it read last, and the
  command's grant is for the version it started from. Since #2095, `routines watch` is such an
  engine: there, the turn of an agent that lists a connector fails with that reason, and an agent
  that lists none runs as before. Starting them from the version a run read, with that version's
  grant, is a follow-up.

A chat turn still calls the connectors it is given, none by default.

Harness agents stay refused in `halonic run` (HAL-6476). Wiring them comes in B2a-2.

## Tests

No test was weakened. `live-version-programs.test.ts` now goes through the CLI's engine: a run of
the live version calls a real MCP program, and the committed script answers, never the saved
change; afterwards no copy is left. Run on the saved files, the same test gets the saved script,
so it can fail. `run-connectors.test.ts` has 11 unit tests: one start per run, a local connector is
marked local, a connector that isn't local doesn't start in a local-only run, a copy per run, the
workspace folder for the saved files, close before release, a failed close is reported, no version
starts nothing, a connector that can't be created releases the copy and is tried again, the
engine's close ends every run, and nothing starts after it. `local-run-connectors.test.ts` has 3:
sending is off with its reason (now "the CLI can't switch it on yet", as `runs send` and `routines
watch` show it too), a settings error names its connector, and an engine over several versions
starts no run's connectors. The new `workspace-engine-connectors.test.ts` has 5: the runs' connectors get
the command's grant, and `null` for a run that reaches only the test model; a failed clean-up
is only a `--debug` line, however often; a lost engine lock still counts toward stopping
the command, as before; and, through a real run of Weekly report, each connector program is
created with the command's grant, and three that fail to close leave the command going, each
with a `--debug` line. Without the change, that last test fails: the third failure stopped the
command.
`working-folders.test.ts` has 2: a program in a live run's copy is refused the real workspace's
working folders too, and a run in the workspace itself names each folder once.

## Covers

- cli.local-engine
