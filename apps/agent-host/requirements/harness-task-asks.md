# agent-host.harness-task-asks

- Status: active
- Since: unreleased
- Source: HAL-15288 (plan approved by Liam: `HarnessTask.asks` reaches a harness in Studio as in the CLI)

When Studio starts a harness run whose task says `asks: "in-sandbox"`, the agent host shall pass that `asks` on to the harness with the task. It shall answer 400 for a task whose `asks` is any other value, and start nothing.

## Examples

- Given a task with `asks: "in-sandbox"`,
  when Studio starts the run,
  then the harness is started with a task that says `asks: "in-sandbox"`.
- Given a task with `asks: "always"`,
  when Studio starts the run,
  then the host answers 400 and starts no run.
