# Decision: merge control cancels a gone group's queued run only once it is 3 minutes old

- Task: HAL-18454
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-18454 (the ci-fasttrack session's sweep 1, 25 Nov 10:38–11:22 UTC; Liam approves this note in review)
- Kind: internal

## What changes

- `paperclip.merge-control-stale-runs`: a queued merge-group run whose commit no queue entry shows is cancelled only when it is at least 3 minutes old (and, as before, less than a day old). A new example replays run 45600263634. The existing example and its test are unchanged: its gone group's run is 5 minutes old and is still cancelled. No test, example or `expect` is removed.

## Why

A pass reads the merge queue first and the merge-group run list a few seconds later. When GitHub rebuilds a group in between, the new group's run is listed as queued while the queue read still shows the old group commit, so the run looks gone. On 25 Nov at 11:00 #6052 failed its group and GitHub rebuilt #6053's group without it: run 45600263634 was created at 11:00:03, and the shadow decided to cancel it. It went green at 11:03 and #6053 merged. In `act` mode that cancel would have cost a full group rerun. Runs this rule is for, left behind by a removed group, stay queued far longer than 3 minutes, so the floor only delays their cancel by one or two passes.

## Covers

- paperclip.merge-control-stale-runs
