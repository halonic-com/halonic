# Decision: the loader leaves agents' working folders and `node_modules` out

- Task: HAL-13334
- Approval: Liam approved the plan on HAL-13334 (https://paperclip.halonic.com/HAL/issues/HAL-13334), 19 November, including the changes to `workspace.extract` and `workspace.unreadable-file` and that `ignored` no longer lists left-out files, which is the sentence `workspace.load` gains.
- Kind: internal

## What changes

`loadWorkspace` now reads the agent files first, then passes the port's `leaveOut` to `list()` and
`version()`: the working folder of every harness agent and every `node_modules` folder. The new
requirement `workspace.load-leaves-out-working-folders` says what it does. Three existing
requirements change with it:

- `workspace.load` gains one sentence: the loader neither lists nor reads the folders it leaves
  out, so their files aren't among the ignored. Nothing else in it changes, and its examples stay.
- `workspace.unreadable-file` gains one example: a file the account may not read inside a working
  folder no longer fails the load, because the loader doesn't read it. Its other examples stay true.
- `workspace.extract` gains three things. Files in a `node_modules` folder aren't taken. A knowledge
  source whose documents sit in a left-out working folder makes `planHubExtract` name the folders it
  needs, rather than quietly leave the documents behind. `extractHub` lists those folders from the
  source, so the documents still go along. It gains two examples for this.

`packages/core/workspace/src/extract-hub.test.ts` and `apps/cli/src/output/validate-report.test.ts`
change too. The first only gains tests. The second gives its hand-built loaded workspace the new
`leftOut: []`. No test or golden file is weakened, skipped or removed.

## Why

An agent's working folder and its installed packages can hold tens of thousands of files and no
definitions. A folder store read every byte of them on every load: `halonic run`, `trust`,
`validate`, and Studio's problem check after every edit. No run records the loaded workspace's
version (the plan's finding), so changing what it covers shifts no recorded history.

Hub extract used the loaded files and the ignored ones as the list of every path. Without the change
to `workspace.extract`, a knowledge source pointing into a working folder would lose its documents
in the new workspace (Liam's review of the plan). `node_modules` stays behind because it is
installed, not written: the workspace's own `.gitignore` usually keeps it out of git too.

## Covers

- workspace.load
- workspace.unreadable-file
- workspace.extract
- packages/core/workspace/src/extract-hub.test.ts
- apps/cli/src/output/validate-report.test.ts
