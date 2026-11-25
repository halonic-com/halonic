# paperclip.merge-control-facts

- Status: active
- Since: unreleased
- Source: HAL-17783; the merge controller ADR (HAL-17700, board 24 Nov 17:47: runner capacity from the CI live metrics and the CI server's status file, unreadable counts as short)

When merge control's job runs in a mode other than `off`, the plugin shall read each pass's merge snapshot and the Merger's writes using only GET requests and GraphQL queries to the GitHub API with the read-only token, and GET requests to the CI status file and Prometheus addresses in its settings, and shall give capacity as unknown when either of those two can't be read, is stale or isn't set.

## Examples

- Given recorded GitHub answers with a ready pull request, two queued ones, a red fast-track one and a failed merge group,
  when the reader runs,
  then the snapshot has the queue, the gate's pull requests with their checks' workflows and events, manifests and the red run's annotations, the group's failed jobs, `main`'s file sizes and the capacity, and `decide` queues the ready one.
- Given a status file that doesn't answer, one older than 5 minutes, or no Prometheus address set,
  when the reader runs,
  then capacity is null and the log says why.
- Given a full read,
  when it finishes,
  then every request was a GET or a GraphQL query to `https://api.github.com`, or a GET to one of the two capacity addresses.
- Given the Merger's login in the settings, an entry it queued ahead of an older one, a dequeue and a comment by it, a merge-group run it reran, and a queued run it cancelled between two passes,
  when the second pass reads,
  then the Merger's writes list the enqueue as a jump, the dequeue, the comment, the rerun and the cancel.
