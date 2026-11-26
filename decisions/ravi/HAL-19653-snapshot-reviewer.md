# Decision: the reviewer wake wakes the reviewer the snapshot names

- Task: HAL-19653
- Approval: HAL-19653, the follow-up of the board's decision of 26 Nov on HAL-18422 (one source for who reviews a pull request, HAL-19639)
- Kind: internal

## What changes

`paperclip.merge-watchers-reviewer-wake` said the wake goes to Julian for a pull request on a
`liam/` branch and to Liam otherwise. It now says the wake goes to the reviewer the snapshot names
(`paperclip.snapshot-reviewer`): Liam on `liamWakeTask`, Julian on `julianWakeTask`, and Nora on
the new `noraWakeTask` setting. One example is added: a routine pull request the snapshot names
Nora for wakes her on `noraWakeTask`, and not Liam.

## Why

The board decided on HAL-18422 that one source decides who reviews a pull request. `pr_status`
and the PR watcher's handoff already named Nora for routine pull requests (HAL-19639), but the
wake, which reads only the snapshot, still woke Liam for them. The rule is not relaxed: the wake
fires under the same conditions and after the same wait; only who it reaches follows the shared
answer. A pull request whose answer can't be read still wakes Liam, or Julian on Liam's own, as
before.

## Tests

No test was skipped, weakened or deleted. `reviewer-wake.test.ts` gains the Nora case, and
`run.test.ts` gains a routine pull request that wakes Nora, so its dry run now logs Nora's wake
too. The existing Liam and Julian cases are unchanged and pass.

## Covers

- paperclip.merge-watchers-reviewer-wake
