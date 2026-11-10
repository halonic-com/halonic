# harness-claude-code.command

- Status: active
- Since: 0.1.0
- Source: HAL-194 build plan C3; HAL-3586

The Claude Code harness shall start `claude -p` with `stream-json` as its input and output, the bridge's MCP server from the settings folder and no other, and the bridge's `approve_permission` tool as its permission-prompt tool. It shall add the agent's model and instructions as arguments when its file sets them. The prompt and every later answer shall go to Claude Code as `stream-json` user messages on its standard input, never in the arguments. It shall read Claude Code's output line by line, whatever line breaks it uses and however the bytes are split.

## Examples

- Given an agent whose file sets the model "claude-sonnet-5-5" and instructions,
  when its command is built,
  then the arguments hold `--model claude-sonnet-5-5` and `--append-system-prompt` with the instructions, and not the prompt.
- Given an agent whose file sets no model and no instructions,
  when its command is built,
  then neither `--model` nor `--append-system-prompt` is among the arguments.
- Given the prompt "Name a colour of the sea.",
  when it is sent,
  then Claude Code reads one line: a user message with that text.
- Given output whose lines end with "\r\n" and whose "é" is split across two chunks,
  when it is read,
  then the lines come back whole, without their line breaks.
