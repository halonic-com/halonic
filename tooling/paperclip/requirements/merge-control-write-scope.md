# paperclip.merge-control-write-scope

- Status: active
- Since: unreleased
- Source: HAL-17706; the merge controller ADR (HAL-17700, board 24 Nov 17:47: its own queue credential); HAL-18470 (close and reopen for the label-noop self-fix)

When merge control writes to GitHub, the plugin shall send only the `enqueuePullRequest`, `dequeuePullRequest`, `closePullRequest` and `reopenPullRequest` mutations, a workflow run's rerun, rerun of failed jobs and cancel, and a comment on a pull request, only as POST requests to `https://api.github.com` and only on the repository it acts on, refusing anything else before it is sent; it shall resolve the queue token at each write, only in `act` mode, keep it out of its state, logs and errors, and build the write client only in the merge-control job.

## Examples

- Given each of the eight allowed writes,
  when the client sends them,
  then each goes as a POST to its one address on `https://api.github.com` and the token is asked for once per write.
- Given a request to another host, another mutation or query, a mutation with another variable, another REST path or method, or another repository,
  when it is checked,
  then it is refused, nothing is sent and the token is not asked for.
- Given GitHub answers a write with an error that repeats the token,
  when the error is thrown,
  then it carries GitHub's status and reason with the token replaced by `[token]`.
- Given `act` mode and a pass with an enqueue, a dequeue and a rerun,
  when the pass runs,
  then each write is sent and the token is resolved once per write.
- Given `act` mode without a queue token,
  when a pass runs,
  then nothing is written and the log says so.
- Given the package's source files,
  when they are read,
  then only `act.ts` and the merge-control job import the write client.
