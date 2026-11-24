# harness-claude-code.coding-tools

- Status: active
- Since: unreleased
- Source: HAL-16737 plan, PR 4; Liam's conditions on HAL-16748 and HAL-16752; HAL-16753

When the task names a coding tools server and the session's fence state is `fenced`, the Claude Code harness shall write `halonic-tools-mcp.json` to the session's temp folder, naming the server `halonic-tools` as a stdio server with the task's command and arguments followed by `--temp-folder <the session's temp folder>`, `--tools all` and, when the step's time limit is at least 10 seconds, `--max-test-seconds <that limit>`, and shall pass that file as a second `--mcp-config`, before `--strict-mcp-config`. When the fence state is anything else, unknown or missing, or the task names no server, it shall write no such file and name no server.

## Examples

- Given a task with a server and a fenced session with a 600-second time limit,
  when the run starts,
  then `halonic-tools-mcp.json` names `halonic-tools` with `--tools all` and `--max-test-seconds 600`, and Claude Code gets it as a second `--mcp-config`.
- Given a session whose fence is `off`, `not-fenced`, `stopped`, an unknown state or none,
  when the run starts,
  then no server is named.
- Given a fenced session and a task without a server,
  when the run starts,
  then no server is named.
