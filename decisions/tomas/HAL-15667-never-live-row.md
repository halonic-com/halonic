# Decision: Studio's Routines list says Not live yet for a routine never live

- Task: HAL-15667
- Approval: Liam approves this change on HAL-15667 (https://paperclip.halonic.com/HAL/issues/HAL-15667), for HAL-15667. A team decision with no board card (HAL-2282 rule): Sofia picked the words on HAL-15668, and the change makes the row say what the scheduler already does.
- Kind: user-visible

## What changes

A routine that is on but that no version holds yet, in a folder that keeps history, isn't
started by the scheduler (`app.scheduler-never-live-not-scheduled`). Its page already says
"This routine isn't live yet, so it doesn't run.", and since #4811 the CLI's Next column says
"Not live yet". Studio's Routines list row still showed a next time, a run that wouldn't happen.

The list now marks such a routine (`neverLive` on the listing, from core's `liveState`), and its
row's line ends in " · Not live yet" with no time, in place of "Changes not live yet" as well,
since a routine never live has no live version for its changes to differ from. A routine that is
off keeps the chip "Off" and no such words.

The requirement `studio.workspace-routines-live-schedule` gets one sentence saying the list marks
such a routine, and its last example adds that the row shows "Not live yet" and no next time. Its
summary and Next still follow the saved file, as before. No example was removed, and no test was
weakened or skipped: the never-live test now also checks the mark, and the not-live test checks
its absence.

## Covers

- studio.workspace-routines-live-schedule
