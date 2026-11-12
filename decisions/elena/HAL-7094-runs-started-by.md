# Decision: the Runs list's rows say what started each run

- Approval: the Started by column is in the approved T8 checklist (1.2, 1.5b CU4) and microcopy
  (15.1, 19.3); the words for a run started in the terminal and a child run are the team's call on
  [HAL-7094](/HAL/issues/HAL-7094). Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:JqH1Vu9ootQJXGuX1RGej50nCTvCvqwE2YYF+cX5Lq9U6xPglc3XggWsMzc/WYZzCJ2Yk2IhO5D13atOfpooBw==
- Task: HAL-7094

## What changes

`runs.row-columns` gets the Started by column between what ran and the time, and a row's screen
reader sentence says what started the run: "… Started by you, in the terminal, 10:40." took the
place of "… Started at 10:40.". Its first example and the tests that check those sentences change
with it, and three examples for the column's words are new. No example was removed, and every
other assertion stays as it was.

The sentence has its own words for what started the run, so it reads on from "Started by" without
the column's "arrived" or "·" (Liam's review on [HAL-7125](/HAL/issues/HAL-7125); small wording on
approved mc 19.3, the team's call under HAL-2282):

| Started by column | The sentence says "Started by …" |
| --- | --- |
| You, with Run | you, with Run |
| You, in the terminal | you, in the terminal |
| A message arrived | a message |
| A signal arrived | a signal |
| Schedule · weekdays at 08:00 | the schedule, weekdays at 08:00 |
| Caught up after sleep | a catch-up after sleep |
| Test “Refund over €100” | the test case “Refund over €100” |
| A test case | a test case |
| Run 7k2m9p | run 7k2m9p |

The column's words stay as they were. The routine's schedule example in `runs.row-columns` now also
states its spoken words.

## Why

[HAL-7084](/HAL/issues/HAL-7084) left the column out because the Runs source didn't give a
routine's name and schedule yet. Microcopy 19.3 writes the row's sentence with "Started by
<words>"; "Started at 10:40" was the stand-in until the column came.

## Covers

- runs.row-columns
- packages/studio/features/runs/src/list/run-row.test.ts
- packages/studio/features/runs/src/ui/runs-page.test.tsx
