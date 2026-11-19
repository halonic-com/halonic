# Decision: Started by names the routine whose Run now started a run, and Run again shows once

- Task: HAL-12406
- Approval: the Started by column and the Details row are in the approved T8 checklist (1.2, 1.11) and microcopy (15.1, 19.3); the words for a routine's Run now are small wording on those approved screens, the team's call under HAL-2282 (Elena with Sofia, who agreed both on HAL-12440). Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:/gxnm1pY9DEBArp0YGUV1uxp+tawD9hr7ScBZOoF1QruRG0A/yYeLN2nrrNPYrykoV1ylF0pNJ/yO2AB8w0mCw==

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

### Run again shows once

A failed run had **Run again** twice, in the header and as the failed banner's button, both written
into `runs.run-view.run-again` (HAL-11049). It is now the last button of a failed (danger) banner
that offers it, and otherwise in the header, never both. The banner offers it when it has no button
of its own; the header keeps it for a done run, a budget stop, a cancelled run and the sandbox's
banner. The requirement's sentence changes to "It shall be the last button of a failed (danger)
banner that offers it, and otherwise a button in the page's header, never both", with two new
examples (a failed `provider-busy` run: one Run again, in the banner; a done run and a budget stop:
one, in the header). The test that counted two Run agains now counts one; the test that pressed
both now presses the one button three times.

## Why

Found in the usability walk-through (HAL-12375, Stage C23): a new user couldn't tell which runs came
from which routine, except on the routine's own Runs tab. The name is in the words, not a tooltip,
because a person pressed Run now on that routine, and the name is what tells two such runs apart. A
routine that is gone keeps its key in the tooltip, as the schedule's words already do. The name
comes first because people scan the column for which routine; "with Run now" already says a person
pressed it, so no "You" in front. Sofia weighed "You, with Run now on Weekly report" and didn't pick
it: it is longer and leaves unclear whether the name is the workflow's or the routine's.

Run again stays in the banner, not the header, because microcopy 15.3 makes it the banner's main
button for the causes that pass on their own, right where the user has read why the run failed;
after a fix's buttons, the order says "fix it, then run again". The keyboard order still reads:
the header's actions, then the banner with its fix and Run again.

Not now: a schedule run names its routine only in the tooltip, and the link back to the routine
needs a link style in Details that the run page doesn't have yet. Both are follow-ups.

## Covers

- runs.row-columns
- runs.run-view.details
- runs.run-view.run-again
