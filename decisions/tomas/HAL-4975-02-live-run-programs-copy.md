# Decision: a live run's programs start in a copy at its commit

- Requirements: `app.runs-read-latest-version` (`packages/core/app/requirements/runs-read-latest-version.md`)
- Task: HAL-4975, step 2, follow-up from Julian's security review on HAL-4966 (option 3)
- Approval: Liam approves this note in his review of this pull request on
  [HAL-4975](/HAL/issues/HAL-4975); Julian reviews it for security
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:mlVLfW3sDzXthJ2D3G2XY079Jhj7yX2PYrhHYSZrB95kNUn7maXAelB1ofg1EGluVQKhTWnFxIMxwCmrsm2YAg==

## What changes

`app.runs-read-latest-version` had a known limit for v0.1: a program a live run started from the
workspace, such as an unpinned stdio connector's script or a harness agent's working folder, read
the saved files on disk, so a saved change that wasn't live, such as a script an agent wrote, could
run in a scheduled routine before anyone made it live. The requirement now says the program starts
in a copy of the workspace at the run's commit instead, as the plan on HAL-4975 set out:

- The copy holds only what git holds at the commit: no private entries such as `.env`, nothing
  installed such as `node_modules` or `.venv`.
- When the copy can't be made, the program doesn't start. The saved folder is never used in its
  place.
- The copy is removed when the engine closes; one left by an engine that was stopped or lost power
  is removed when the next engine opens on the workspace. A leftover git can't sweep, such as when
  history was turned off or git is gone from the `PATH`, is reported and removed as a plain folder:
  it never stops the engine from opening.
- A new line says that in 0.1 no run starts a program from the workspace yet, and that whoever wires
  connectors or harnesses into the engine takes their folder from the engine's program folders.

The CLI's engine gets `programFolders` (`apps/cli/src/program-folders.ts`), on the
`ProgramCopies` service of PR 1793, with the copies in a new folder of the workspace's folder in
the profile, `program-copies`. The engine holds the workspace's engine lock while it sweeps that
folder, so no other engine owns a copy in it.

Worth knowing: the CLI's engine still starts no connector or harness program in a run
(`connectors: []`). When they are wired in, they take their folder from
`programFolders.folderFor(<the run's version>)`, never the workspace folder, and the test in
`live-version-programs.test.ts` changes to go through the engine; the requirement's new line says so.

## Tests

No test was weakened. The test in `live-version-programs.test.ts` recorded the known limit: it
expected a live run's connector to answer "the saved script". It now starts the connector in the
folder `programFolders` gives the live run and expects "the live script", and its example in the
requirement changes with it. `program-folders.test.ts` adds the copy without private files, the
saved files with history off, the refusal without falling back, the clean-up on close and on
the next open (also of a folder git has no record of, and with no history at all), and a second try
at starting git after it failed. `local-engine-host.test.ts` adds an engine that opens despite a
leftover copy in a workspace without history.

## Covers

- app.runs-read-latest-version
- apps/cli/src/commands/run/live-version-programs.test.ts
