# Decision: the window's engine opens for routines and timers, and the Routines page says so

- Approval: HAL-14205 (Step A of the HAL-45 plan; a team decision, no board card)
- Kind: user-visible

## What changes

`studio.engine-service`: besides the first start or send, the Studio opens the workspace's engine
when a workspace that may start runs has an enabled routine on a schedule or an interval, or a run
timer waiting. It checks when the workspace opens, when its trust changes and after a save. "It
shall not take the lock before the first start or send" now holds only for a workspace that needs
none of that. When another engine holds the lock then, the refusal goes to `reportError` and the
window shows nothing, so `halonic routines watch` can keep the workspace. One example is added; no
example is changed or removed.

`routines.list.rows-and-states` and `routines.when.when-card`: the line "Routines start on time
only while `halonic routines watch` is running in a terminal." becomes "Routines run while Halonic
is open." on the list, and the When card's "Starts on time only while `halonic routines watch` is
running in a terminal." becomes "Starts on time while Halonic is open." The two tests that read
those lines change to the new words; the When card's test no longer looks for the command in a
`code` element, because the line names no command.

## Why

The window's engine now starts routines on time (`studio.engine-routines`), but it opened only at
the first run or send, so a workspace with routines started none of them, and waiting runs' timers
didn't fire, until the person started something. The old line was true only while the app had no
scheduler. The new wording is small wording on the approved Routines screen, so the team decides
it (HAL-45 plan, Step A); the engine that runs with the window closed (B1) changes it again.

## Covers

- studio.engine-service
- routines.list.rows-and-states
- routines.when.when-card
