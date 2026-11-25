# paperclip.merge-control-sim

- Status: active
- Since: unreleased
- Source: HAL-17704; the merge controller ADR (HAL-17700, board 24 Nov 17:47)

When a recorded day is replayed under a rule set, the plugin's simulator shall step through it a minute at a time, run `decide` with that rule set on each minute, play the merge queue with the day's group build time, refix time, build limit and runner capacity, and report the time to merge (median and 90th percentile) for fast-track and other pull requests, the queue wait, the jumps, the groups cancelled by jumps, removals and failed groups, the runner-minutes lost and the fast-track re-queues; and its importer shall build such a day from the Merger's queue manager log, queue snapshots, fast-track jump log and gate report.

## Examples

- Given a fast-track pull request ready with 5 entries queued,
  when the day is replayed under jump >3 and under jump >8,
  then jump >3 jumps once and cancels 5 groups, and jump >8 cancels none.
- Given a fast-track pull request ready with 12 queued and a group that fails behind it,
  when the day is replayed under jump >8 and under "front of the line without a rebuild",
  then jump >8 cancels 8 groups, and the candidate cancels none and puts the fast-track pull request first once when the failure rebuilds the queue.
- Given runners that take 3 groups at once,
  when the day is replayed under the Merger's rule until 18:15 and under jump >3 with the capacity gate,
  then only the Merger's rule jumps.
- Given the Merger's log adds #2, holds it as a culprit and adds it again 90 minutes later,
  when the day is imported,
  then #2 fails its first group and the refix time is 90 minutes.
