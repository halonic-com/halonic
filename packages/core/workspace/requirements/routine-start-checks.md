# workspace.routine-start-checks

- Status: active
- Since: unreleased
- Source: HAL-14298 (C340 C30 (b), Nina's check on HAL-14271, row 11; decided by Liam on the task)

When `loadWorkspace` has parsed a workspace's files, the workspace package shall report as an error with the code `unknown-trigger-value`, starting with `Routine "<id>": `, each placeholder in a routine's workflow input or agent prompt that isn't a value of its trigger, with the message of `routines.trigger-values`, at the key path and line of that input key or of the prompt.

## Examples

- Given a schedule routine whose input is `{ day: "{{trigger.date}}" }`, when the workspace is loaded, then `unknown-trigger-value` is an error at `run.input.day`, and `halonic validate` exits 1.
