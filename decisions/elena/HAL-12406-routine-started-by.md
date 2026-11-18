# Decision: Started by names the routine whose Run now started a run

- Task: HAL-12406
- Approval: the Started by column and the Details row are in the approved T8 checklist (1.2, 1.11) and microcopy (15.1, 19.3); the words for a routine's Run now are small wording on those approved screens, the team's call under HAL-2282 (Elena with Sofia on HAL-12406). Liam approves this note in review
- Kind: user-visible

## What changes

A run started with **Run now** on a routine records the routine in `trigger.routineId`, but Started by
said "You, with Run", the same as a run started from a workflow's page. It now names the routine, on
the Runs list, in Details on the run page and on the Inbox's run facts, which share the words:

| Started by | The row's sentence says "Started by …" |
| --- | --- |
| Weekly report routine, with Run now | the Weekly report routine, with Run now |
| A routine, with Run now (its key in the tooltip, once the routine is gone) | a routine, with Run now |

A run started with Run on a workflow's page keeps "You, with Run". `runs.row-columns` gains two
examples and `runs.run-view.details` one; no example was removed and no test was weakened.

## Why

Found in the usability walk-through (HAL-12375, Stage C23): a new user couldn't tell which runs came
from which routine, except on the routine's own Runs tab. The name is in the words, not a tooltip,
because a person pressed Run now on that routine, and the name is what tells two such runs apart. A
routine that is gone keeps its key in the tooltip, as the schedule's words already do.

## Covers

- runs.row-columns
- runs.run-view.details
