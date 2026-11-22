# engine.harness-task-asks

- Status: active
- Since: unreleased
- Source: HAL-15288 (plan approved by Liam: `HarnessTask.asks`, set only from the agent's file)

When the engine starts a harness program for an agent whose file says `asks: in-sandbox`, it shall give the task `asks: "in-sandbox"`, read from the agent's file the run started with. When the file says `asks: always`, or has no `asks`, the task shall have no `asks`, so the harness asks a person before its program runs a command.

## Examples

- Given an agent with `asks: in-sandbox`,
  when the engine starts its harness program,
  then the task says `asks: "in-sandbox"`.
- Given an agent with `asks: always`,
  when the engine starts its harness program,
  then the task has no `asks`.
- Given an agent without `asks`,
  when the engine starts its harness program,
  then the task has no `asks`.
