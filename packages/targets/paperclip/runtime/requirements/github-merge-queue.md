# runtime.github-merge-queue

- Status: active
- Since: unreleased
- Source: HAL-18231, option A of Liam's decision on HAL-18230: `github.merge-queue` reads the merge queue live in the runtime, because `tooling/paperclip`'s `queue_state` reads the PR watcher's snapshot, which the runtime doesn't have

When a tool runs `github.merge-queue`, the runtime shall read each of the tool's `repositories` with one read-only GraphQL query through the runtime's query reader, and answer, in the shape of `tooling/paperclip`'s `queue_state`, each merge-queue entry in queue order with its position, state, `ci-ok` on its group commit (`not formed` before GitHub made one), minutes in the queue, who queued it and GitHub's estimate, the merge-group jobs queued for a runner with each group commit counted once and how long the longest has waited, and each open pull request labelled `fast-track` with who added the label, naming an adder GitHub doesn't give as unknown and never as allowed; it shall name a task only for a branch in the repository itself, never queue, dequeue or reorder anything, answer a GitHub error as the tool's error, and name a repository after the first that the token can't reach instead of failing.

## Examples

- Given `queue_state` on `acme/website`, whose merge queue is empty and which has no `fast-track` pull request,
  when Mateo calls `queue_state`,
  then it answers "0 in the queue; no merge-group job waits for a runner" and "no open pull request carries fast-track", after one request to api.github.com/graphql.
- Given a queue at 15:05 where #41 and #42 share a group commit with a green `ci-ok` and 2 jobs queued since 14:58 and 14:59, #43 has no group yet and #44 comes from a fork,
  when an agent calls `queue_state`,
  then it lists #41 to #44 in queue order, #41 and #42 with group `ci-ok` success, #43 as not formed, #44 with no task, and 2 waiting jobs, the longest 7 minutes.
- Given an open pull request labelled `fast-track` by `acme-lead` and another whose label event GitHub no longer returns,
  when an agent calls `queue_state`,
  then the first names `acme-lead` and the second says unknown, never counts as allowed.
- Given GitHub answers the query with an error,
  when an agent calls `queue_state`,
  then the tool answers with that error and no data.
- Given `queue_state` on `acme/website` and `acme/private-tools`, and a token that doesn't reach the second,
  when an agent calls it,
  then it answers for `acme/website` and names `acme/private-tools` as not read.
