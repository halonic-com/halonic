# paperclip.signal-thin-spec

- Status: active
- Since: unreleased
- Source: HAL-18319 (plan HAL-17450 rev 5, "Step 2"; split from HAL-18196)

The `thin-spec` signal rule shall work out the thin-spec check's actions from a compact JSON input (time only from `now`, the settings, the board's clarifier, and per changed task its status, assignee, creator, creation time, labels, whether it is a clarify task or was already checked, its thin-spec score or none yet, and its `Done when` text or none) and give the same outcome as `paperclip.thin-spec-check` and `paperclip.done-when-lint`. It shall act only on a new task (created within `newForHours`, default 24) that an agent holds in `backlog` or `todo`, with a difficulty tag from D1 up to `upTo` (default 4), that is no clarify task and wasn't checked. Without a score it shall ask for one reading. With one, it shall log the check (flagged when the score is above `threshold`, default 0.5, and whether a checkable `Done when` line is missing, when `doneWhen` is on), then comment on a missing `Done when` line, then, for a flagged task or a missing line, add one clarify task for the agent that asked for the task, or the board's clarifier, or report that there is none. No action shall carry the task's title or text.

## Examples

- Given each fixture of the thin-spec check (flagged, with blockers, created by a person, without a clarifier, unflagged, a failed call, each task it skips, and no `Done when` line with a clear or a flagged score), when the check and the rule decide over the reading and the pass after it, then their actions are equal.
- Given each description of the `Done when` lint's detector, when the check and the rule decide on a task with a clear score, then they comment and clarify on the same ones.
- Given a task already checked, when the rule decides, then it gives no action.
- Given `threshold: 0.9` and `doneWhen: false`, when a task scoring 0.88 without a `Done when` line is decided, then it is logged unflagged with nothing else; given `upTo: 1`, a D2 task is skipped; given `newForHours: 72`, a two-day-old task is checked.
