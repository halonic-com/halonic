# harness-opencode.command

- Status: active
- Since: unreleased
- Source: HAL-16826 (plan, step 0 results: `--standalone` always, `--title` removes the title call); HAL-18101

The OpenCode harness shall run `opencode run --standalone --auto --archived --format json --title <agent id>`, with no message argument, so the prompt goes on standard input and never in the arguments. It shall never pass `--server`. An agent id that isn't one plain word of letters, digits and `.`, `_`, `-`, starting with a letter or digit and at most 128 characters, shall be refused, so it can't be read as an option.

## Examples

- Given the agent `writer`,
  when the command is built,
  then it is `opencode run --standalone --auto --archived --format json --title writer`.
- Given the agent id `--server`,
  when the command is built,
  then it is refused.
