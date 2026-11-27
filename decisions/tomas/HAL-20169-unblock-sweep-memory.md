# Decision: the unblock sweep acts only on a blocker that finished after the task was blocked

- Approval: https://paperclip.ing/HAL/issues/HAL-20169
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:coVdV46UEkYmghi39GRJukW8+9txS/zlBPt5pJYCgQsnSerxA7EqPYPJK/30RgNw9un3uA1w8/hvpQtczH0HBw==

The board approved this fix on 26 Nov (HAL-20169, from the Agent tools safety sweep of that day).

The unblock sweep put a task back to `todo`, and woke its agent, whenever everything in its
"blocked by" was finished. An agent that set a task to blocked for a reason its old, finished
blockers don't show got it back on the next pass, and again on every pass after it set it to
blocked once more. HAL-19316, HAL-19131, HAL-19191, HAL-17402 and HAL-19292 went round that way.

Now the sweep unblocks a task only when at least one of its blockers finished after the task was
last set to blocked (Paperclip's `blockedTransitionAt` against the blocker's `completedAt` or
`cancelledAt`), and never twice for the same blockers with the same last finish: it remembers the
last unblock per task in plugin state. A time Paperclip doesn't give counts as after, so a task is
never stranded by a missing time; the memory keeps that case to one unblock. A reopened blocker
that finishes again is a new finish, so the task is unblocked and its agent woken again. The
plugin already had `plugin.state.read` and `plugin.state.write`, so it needs no new capability.

`paperclip.pr-watcher-unblock` gets these two conditions, the re-read before the write checks the
time too, and three examples. No test is weakened: every earlier test still passes unchanged in
what it checks, the sweep's adapter moves from `host.ts` to `unblock-host.ts` with its tests, and
the new cases each get a test.

## Covers

- paperclip.pr-watcher-unblock
