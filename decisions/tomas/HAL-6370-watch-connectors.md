# Decision: in `routines watch`, a run's connectors start from the load its definitions came from

- Requirements: `cli.local-engine` (`apps/cli/requirements/local-engine.md`)
- Task: HAL-6370, re-ported onto `main` as HAL-7978, after HAL-7500
  (`decisions/tomas/HAL-7500-watch-version-connectors.md`)
- Approval: Liam chose this scope (option 1) on HAL-7835, a team decision
  with no board card; he approves this note and signs it in his review of this pull request
- Kind: internal

## What changes

HAL-7500 made a watch run's connectors start from the version the run read: `trustedVersionOf`
loads that version again when the connectors open, checks it for trust and gives its grant. That
leaves one gap. For a run of the saved files, "that version" is the files as they are when the
connectors open, so an edit made between the run's start and its first connector step reaches the
connectors, although nobody checked those files.

Now the watch keeps, for each run it starts, the workspace the run's definitions were read from
(the engine passes `runId` to `definitionsOf`), and `trustedVersionOf` gives that same workspace
until the run ends:

- **What stays from HAL-7500.** `trustedVersionOf` still checks the version for trust when the
  connectors open, and its grant is the one the connectors start with. A trust removed in between
  still starts nothing. The reload for a version has the same checks as before.
- **What is added.** Only the kept load. The connector files and the working folders they are
  refused come from the files the definitions came from, so an edited saved file doesn't reach
  them. The watch forgets a run's load when the run ends (`FolderRunConnectors.end` tells it, also
  for a run that never opened a connector).
- **A run from before the watch** (a restart) has nothing kept. Its recorded version is loaded
  when the connectors open: the same files for a live version, the saved files as they are now for
  the saved files, as a saved file has no version to go back to. This is the same as HAL-7500.
- This note makes no claim of "no second load path": the reload stays, for runs the watch didn't
  start.

`WorkspaceVersions` moves from `local-engine-host.ts` to its own file, `workspace-versions.ts`, because
the host file would pass the 500-line limit.

The requirement gets one clause and one example for the saved-files case.

## Tests

`watch-versions.test.ts` has 5 (3 before): a run's connectors get the load its definitions came
from, not a saved edit made since, with trust checked again; and a run the watch didn't start, or
one that ended, reads the saved files as they are now. `run-connectors.test.ts` has 12 (11): the
host hears that a run ended even when none of its connectors started. `local-run-connectors.test.ts`
keeps its 4, and its test of a run's connectors now also asserts the host is told when the run
ends. `watch-live-version.test.ts` is unchanged and stays under 500 lines, so it needs no split.

## Covers

- cli.local-engine
- apps/cli/src/local-run-connectors.test.ts
