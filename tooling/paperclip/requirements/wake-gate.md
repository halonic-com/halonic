# paperclip.wake-gate

- Status: active
- Since: unreleased
- Source: HAL-18985 (board go 26 Nov, token plan Track B on HAL-18938, lever 6); built on HAL-17402's state packet

When the server asks the Agent tools plugin's `state-packet` data key before an `issue_monitor_due` run starts, while the `wakeGate` setting is `measure`, the plugin shall work out whether the run has something to do, log the verdict with the task and its reason, and count it as `wake_gate.would_skip` or `wake_gate.would_run`. The answer to the server shall stay what the state packet answers, so the run always starts, and the gate shall not delay that answer.

The gate shall say the run would be skipped only when the task has one or more pull requests on an `<agent>/HAL-<n>-<words>` branch that names it, every one of them waits on someone else, and the task's newest comment, if any, is by the task's assignee. A pull request waits on someone else when it is open, not a draft, not conflicting, and its `ci-ok` is pending, or `ci-ok` is green and it waits for a review, for the merge after an approval, or in the merge queue; or when it merged and `ci-ok` on its merge commit is pending.

In every other case the gate shall say the run would start: a draft, a conflict, a red or missing `ci-ok`, a pull request closed without merging, a merged one whose merge-commit `ci-ok` finished, or a newest comment by anyone else, a person or a plugin included.

The gate shall read the pull requests as the state packet does, the kept line while it is at most 5 minutes old and GitHub otherwise. If the task, the snapshot or a read can't be had, or the gate takes longer than 8 seconds, it shall log no verdict with the reason and count `wake_gate.undecided`. With the setting `off` (its default), or for any other wake, it shall log and count nothing.

## Examples

- Given the setting is `measure`, HAL-41's pull request #41 is green, approved by Liam and second in the merge queue, and the newest comment is the assignee's hand-off,
  when the server asks before a monitor wake,
  then the log says `would skip HAL-41: acme/rockets#41 waits for the merge queue`, and the run starts.
- Given the same pull request and a newer comment from a person,
  when the server asks,
  then the log says `would run HAL-41: the newest comment is from someone else`.
- Given #41's `ci-ok` is red,
  when the server asks,
  then the log says `would run HAL-41: acme/rockets#41 needs its author`.
- Given the setting is `off`,
  when the server asks,
  then nothing is logged or counted.
