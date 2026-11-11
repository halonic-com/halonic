# harness-claude-code.command

- Status: active
- Since: 0.1.0
- Source: HAL-194 build plan C3; HAL-3586; HAL-3750; HAL-5216

The Claude Code harness shall start `claude -p` with `stream-json` as its input and output, the bridge's MCP servers from the settings folder and no others, only the settings in the agent's own settings folder (`--setting-sources user`, never a working folder's project or local settings), and the bridge's `approve_permission` tool, `mcp__halonic-approvals__approve_permission`, as its permission-prompt tool. It shall add the agent's model as an argument when its file sets one. When its file sets instructions, the harness shall write them to a file in the session's temp folder and name that file with `--append-system-prompt-file`, never put them in the arguments. The prompt and every later answer shall go to Claude Code as `stream-json` user messages on its standard input, never in the arguments. It shall read Claude Code's output line by line, as `harness-kit.read-lines` describes, whatever line breaks it uses and however the bytes are split. A line longer than 16,777,216 characters (16 Mi) shall end the reading with an error, and a reading that stops early shall cancel the output.

## Examples

- Given an agent whose file sets the model "claude-sonnet-5-5" and instructions,
  when its command is built,
  then the arguments hold `--model claude-sonnet-5-5` and `--append-system-prompt-file` with the instructions file, and neither the instructions nor the prompt.
- Given an agent whose file sets no model and no instructions,
  when its command is built,
  then neither `--model` nor `--append-system-prompt-file` is among the arguments.
- Given an agent whose instructions are 40,000 characters long,
  when its run starts,
  then the instructions are in the session's temp folder, and the command line stays under Windows' 32,767 characters.
- Given the prompt "Name a colour of the sea.",
  when it is sent,
  then Claude Code reads one line: a user message with that text.
- Given output whose lines end with "\r\n" and whose "é" is split across two chunks,
  when it is read,
  then the lines come back whole, without their line breaks.
