# Decision: the Runs list's rows say what started each run

- Approval: the Started by column is in the approved T8 checklist (1.2, 1.5b CU4) and microcopy
  (15.1, 19.3); the words for a run started in the terminal and a child run are the team's call on
  [HAL-7094](/HAL/issues/HAL-7094). Liam approves this note in review
- Kind: internal
- Task: HAL-7094

## What changes

`runs.row-columns` gets the Started by column between what ran and the time, and a row's screen
reader sentence says what started the run: "… Started by you, in the terminal, 10:40." took the
place of "… Started at 10:40.". Its first example and the tests that check those sentences change
with it, and three examples for the column's words are new. No example was removed, and every
other assertion stays as it was.

## Why

[HAL-7084](/HAL/issues/HAL-7084) left the column out because the Runs source didn't give a
routine's name and schedule yet. Microcopy 19.3 writes the row's sentence with "Started by
<words>"; "Started at 10:40" was the stand-in until the column came.

## Covers

- runs.row-columns
- packages/studio/features/runs/src/list/run-row.test.ts
- packages/studio/features/runs/src/ui/runs-page.test.tsx
