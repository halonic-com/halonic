# Decision: a routine says whether what it starts needs the sandbox

- Task: HAL-4291 (the routine page's Run now, PR 3 of 4)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-4291 (the CTO's scope for this task: Run now is unavailable while the sandbox can't start, checklist 3.1 and 3.3 of HAL-1833)
- Kind: internal

## What changes

`studio.workspace-routines` gains one sentence and one example: for one routine, the desktop app
also says whether what it starts runs an agent in Claude Code or Codex (the agent itself, or an
agent of the workflow and the workflows it starts). Nothing the requirement promised before is
taken away.

## Why

Run now is only unavailable when the run would start Claude Code or Codex, because only those run
in the sandbox. The routine page reads routines from the workspace's files, never the engine, so
the app has to tell it.

## Tests

No test was weakened or skipped. The new case has its own test in
`apps/studio/src/routines/workspace-routines.test.ts`.

## Covers

- studio.workspace-routines
