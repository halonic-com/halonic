# cli.run-failed-start-agent-name

- Status: active
- Since: unreleased
- Source: task HAL-15203 (item 2 of Iris's flow check C548 on HAL-15156: name the agent, as Studio and the CLI's own "runs on this computer without the sandbox" line do; decided by the team on the task)

When a run's log ends with `run.failed` for `sandbox-start-failed`, `this-computer-start-failed` or `harness-start-failed`, the first line `halonic run` and `halonic runs show` print shall name the failed step's agent as its file names it, such as "Writer", and by its id only when the run's hub no longer has that agent.

## Examples

- Given a run whose step "Read the email" with agent `writer`, named Writer, failed with `this-computer-start-failed` and the error "a program started without a fence can't reach a bridge on a Unix socket",
  when `halonic runs show` prints it,
  then line 1 is "Mail triage failed in the step Read the email: Writer didn't start on this computer: a program started without a fence can't reach a bridge on a Unix socket.".
- Given the same run after `writer.agent.yaml` was deleted,
  then line 1 names `writer`.
