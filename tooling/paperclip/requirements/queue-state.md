# paperclip.queue-state

- Status: active
- Since: unreleased
- Source: HAL-16003; the Board Checker addendum to the supervision plugins plan on HAL-15997 (section 3, `queue_state()`), agreed on HAL-16193 and HAL-16192 on 22 Nov; Liam's rule on HAL-16003 that a label whose adder is unknown never counts as allowed

When an agent calls the Agent tools plugin's `queue_state` tool, the plugin shall answer from the company's last saved GitHub snapshot alone, without a GitHub request, with each merge-queue entry's position, state, `ci-ok` on its group commit, time in the queue and who queued it, the merge-group jobs queued for a runner (each group commit counted once) and how long the longest has waited, and each open pull request labelled `fast-track` with who added the label, naming an adder GitHub doesn't give as unknown and never as allowed; and it shall say when the snapshot is more than 30 minutes old, and answer with an error when the company has no snapshot yet.

## Examples

- Given a merge queue whose first group commit has a green `ci-ok` and whose second has 2 jobs queued since 14:58 and 14:59,
  when the snapshot is taken,
  then it records `success` for the first group, and 2 waiting jobs since 14:58 for the second, from the same query as the first page of open pull requests, and the second page doesn't ask for the queue again.
- Given that snapshot taken at 15:00 and two entries that share one group commit with 2 jobs waiting,
  when an agent calls `queue_state` at 15:05,
  then it lists both entries in queue order and counts 2 waiting jobs, the longest 7 minutes.
- Given an open pull request labelled `fast-track` by `timothy-halonic` and another whose label event GitHub no longer returns,
  when an agent calls `queue_state`,
  then the first names `timothy-halonic` and the second says unknown, never counts as allowed.
- Given a snapshot taken 45 minutes ago,
  when an agent calls `queue_state`,
  then the answer says the snapshot is stale.
- Given a company whose PR watcher hasn't saved a snapshot,
  when an agent calls `queue_state`,
  then the tool answers with an error and sends no request to GitHub.
- Given a snapshot saved before group checks were added,
  when an agent calls `queue_state`,
  then the group `ci-ok` is unknown and the runner wait says it isn't in this snapshot yet.
