# harness-opencode.command

- Status: active
- Since: unreleased
- Source: HAL-16826 (plan, step 0 results: `--standalone` always, `--title` removes the title call); HAL-18101

The OpenCode harness shall run `opencode run --standalone --auto --archived --format json --title <agent id>`, with no message argument, so the prompt goes on standard input and never in the arguments. It shall never pass `--server`.

## Examples

- Given the agent `writer`,
  when the command is built,
  then it is `opencode run --standalone --auto --archived --format json --title writer`.
