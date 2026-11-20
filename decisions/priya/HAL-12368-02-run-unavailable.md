# Decision: reading a workflow also says why its run can't start

- Task: HAL-12368
- Approval: the team's call on HAL-12368 (small detail of an approved screen, HAL-2282), from Sofia's UX check on HAL-12363 (L4, L5 and rule N5) and her note on HAL-12368 from the UX check on HAL-12679 (L4 takes Elena's Harness page step); Liam reviews and signs this note
- Kind: internal

## What changes

The requirement grows; nothing it gave before is removed and no test was weakened.
`studio.workspace-workflow-read`: when the window has an engine, reading one workflow also says,
from the same files with their unsaved changes, why the engine would refuse to start its run: an
agent that lists a connector, or an agent in a harness program where no agent host runs (HAL-10849). It gives the same sentence and next
step that `studio.engine-service` gives after **Run** is pressed: "Set Writer to Halonic on its
Harness page to run it now." for a harness program, and "To start it, run this in a terminal:" with
`halonic run reply` for a connector.

The harness case has no command: under rule N3 a step inside Studio wins over a terminal command
(Sofia, UX check on HAL-12679, with Elena's words from HAL-12642).

## Why

Both refusals are known from the files before the press. With the reason in hand, the workflow page
makes **Run** unavailable and shows the reason and the next step under it, linked by
`aria-describedby`, instead of letting the person press **Run** only to be refused.

The run-starting tests moved from `workspace-workflows.test.ts` to `workspace-workflows-start.test.ts`
to keep the file under 500 lines, so the first file has fewer tests. None were dropped.

## Covers

- `studio.workspace-workflow-read`
- `apps/studio/src/workflows/workspace-workflows.test.ts`
