# paperclip.board-check-merge-speed

- Status: active
- Since: unreleased
- Source: HAL-16194; the Board Checker addendum on HAL-15997, section 1 part (e), with Mateo's answer on HAL-16193 (22 Nov)

When the board check runs its 10-minute pass, the Agent tools plugin shall read the PR watcher's GitHub snapshot from plugin state, without a GitHub request, and keep each pull request that left the merge queue since the last snapshot as merged or dropped with its minutes in the queue, for a week; and on the first pass of each hour, when the snapshot is at most 30 minutes old, it shall compare the last 6 hours' merges per hour, drop rate and median time in queue with the figures its last comment that the gate actually sent named (or the first figures) and, through the write gate, comment once on the Board Checker's task only when one moved clearly, keeping the first figures without a comment.

## Examples

- Given acme/app#11 queued at 14:00 in the 14:20 snapshot, and merged at 14:25 in the 14:30 snapshot,
  when the job runs after each,
  then it keeps acme/app#11 as merged after 25 minutes in the queue.
- Given acme/app#12 in the queue at 10:00 and neither queued nor merged at 10:10,
  when the job runs after each,
  then it keeps acme/app#12 as dropped at 10:10.
- Given a last reported median of 20 minutes and four merges of 60 minutes in the last 6 hours,
  when the job runs at 15:05,
  then it comments "Merge speed changed (time in queue), last 6 hours:" on the Board Checker's task, and doesn't comment at 16:05 with the same figures.
- Given the same record and a pass at 15:05 with writes off,
  when the board turns writes on and the job runs at 16:05 with a fresh snapshot,
  then it comments the trend once, because the comment at 15:05 was only logged.
- Given no snapshot yet,
  when the job runs,
  then it keeps nothing for merge speed.
