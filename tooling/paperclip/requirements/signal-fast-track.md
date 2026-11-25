# paperclip.signal-fast-track

- Status: active
- Since: unreleased
- Source: HAL-18320 (plan HAL-17450 rev 5, "Step 2"; split from HAL-18196), HAL-18973 (the third step)

The `fast-track` signal rule shall work out the fast-track rules' outcome from compact JSON inputs (time only from `now`, the settings, one repository's snapshot, what the last pass remembered, the notice keys already reported, and the board's plugin settings: the pull requests that unblock everyone, the board's login and where a label added as `halonic-dev` counts) in two pure steps, the checks of each `fast-track` pull request and then its notices with what to remember, and together they shall give the same notices and remembered state as `paperclip.fast-track-rules`. A third pure step shall keep the queue-wait log from `now`, every repository's snapshot, the log so far and the UTC day its totals were last given: for each `fast-track` pull request first seen in a merge queue, how many were ahead, whether it jumped and the estimated wait it saved, closed when it merges and kept to the newest 200, with one line of totals once a UTC day while the log has records, and it shall give the same log and totals line as `paperclip.fast-track-rules`. Its settings shall be `reviewEscalateMinutes` (default 15), `enqueueAfterMinutes` (default 10), `queueSlowMinutes` (default 30) and `jumpAhead` (default 8, never below 8), so a signal file can change how long it waits and make a jump rarer, never more common, and never who may add the label.

## Examples

- Given each input of the fast-track rules' tests (new and seen labels, the labels nobody allowed, `halonic-dev`'s scope, review nudges and escalations, failing checks, asks to queue with and without a jump, a stacked pull request, a new head, the queue's slow, failing, removed and merged states), when today's pass and the rule decide, then their notices and what they remember are equal.
- Given the scope tests' pull requests with the board's list or one listed pull request, and the pass tests' passes each from the state the one before kept, when both decide, then their outcomes are equal.
- Given the jump inputs of the pass tests (a `fast-track` entry first seen in the queue, the same pass again, its merge, and a pass on the next UTC day), each from the state the one before kept, when today's pass and the third step decide, then their logs and totals lines are equal; and so for an entry without the label, a repository the snapshot didn't read, and a full log of 200.
- Given `reviewEscalateMinutes: 30`, `enqueueAfterMinutes: 15` and `jumpAhead: 10`, when a pull request has waited 20 minutes for review, 11 minutes approved and green, or 16 with 10 ahead, then the rule nudges without escalating, asks nothing, and asks without a jump.
