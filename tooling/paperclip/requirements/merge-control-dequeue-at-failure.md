# paperclip.merge-control-dequeue-at-failure

- Status: active
- Since: unreleased
- Source: HAL-18506; the live Merger since 25 Nov 12:16 UTC (HAL-18424, Chief on HAL-18470, 25 Nov 12:19)

When a queued pull request's own merge-group CI run of the last hour ends `failure`, and the runner hook didn't refuse all its failed jobs (`paperclip.merge-control-hook-refused`), the plugin shall dequeue it in the same pass and judge the group as for one GitHub took out (`paperclip.merge-control-culprit-hold`), so its head is held in that pass; a group that ends `cancelled` shall not dequeue it, and a pull request another rule takes out in that pass shall be dequeued only once.

## Examples

- Given #5 queued first and #6 behind it, and #5's group run ending `failure` in `Test (core)` 20 minutes ago,
  when a pass runs,
  then #5 is dequeued with reason `group-failed` and held on its head, the hold's comment is the only one, the log says `DEQUEUE_AT_FAILURE #5` and only #6 stays queued.
- Given the same group run ending `cancelled`,
  when a pass runs,
  then nothing is dequeued or held.
- Given the same group run with every failed job refused by the runner hook,
  when a pass runs,
  then nothing is dequeued or held.
- Given a queued pull request that conflicts with `main` and whose group failed,
  when a pass runs,
  then it is dequeued once, for the conflict.
