# paperclip.merge-control-dequeue-at-failure

- Status: active
- Since: unreleased
- Source: HAL-18506; the live Merger since 25 Nov 12:16 UTC (HAL-18424, Chief on HAL-18470, 25 Nov 12:19); cancelled groups HAL-19508, the live Merger since 26 Nov 09:11 UTC (Chief on HAL-18424, 26 Nov 09:07: required jobs only)

When a queued pull request's own merge-group CI run of the last hour ends `failure`, or ends `cancelled` with a failed job that `ci-ok` needs, and the runner hook didn't refuse all its failed jobs (`paperclip.merge-control-hook-refused`), the plugin shall dequeue it in the same pass and judge the group as for one GitHub took out (`paperclip.merge-control-culprit-hold`), so its head is held in that pass; a group that ends `cancelled` with no failed job that `ci-ok` needs shall not dequeue it, and a pull request another rule takes out in that pass shall be dequeued only once.

## Examples

- Given #5 queued first and #6 behind it, and #5's group run ending `failure` in `Test (core)` 20 minutes ago,
  when a pass runs,
  then #5 is dequeued with reason `group-failed` and held on its head, the hold's comment is the only one, the log says `DEQUEUE_AT_FAILURE #5` and only #6 stays queued.
- Given #5's group run ending `cancelled` after fail-fast saw `Typecheck, lint, test, build (studio)` fail (as run 45764061940 for #6381 on 26 Nov),
  when a pass runs,
  then #5 is dequeued with reason `group-failed` and held on its head, and only #6 stays queued.
- Given the same group run ending `cancelled` with no failed job, or with only `Cancel the run on the first failure` failed,
  when a pass runs,
  then nothing is dequeued or held.
- Given the same group run with every failed job refused by the runner hook,
  when a pass runs,
  then nothing is dequeued or held.
- Given a queued pull request that conflicts with `main` and whose group failed,
  when a pass runs,
  then it is dequeued once, for the conflict.
