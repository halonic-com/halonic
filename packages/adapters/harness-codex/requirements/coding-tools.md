# harness-codex.coding-tools

- Status: active
- Since: unreleased
- Source: HAL-16737 plan, PR 4; Liam's conditions on HAL-16748 and HAL-16752; HAL-16753

When the task names a coding tools server and the session's fence state is `fenced`, the Codex harness shall name it to `codex app-server` with `-c mcp_servers.halonic-tools.command=…` and `-c mcp_servers.halonic-tools.args=[…]`, the arguments being the task's followed by `--temp-folder <the session's temp folder>`, `--tools read-only` and, when the step's time limit is at least 10 seconds, `--max-test-seconds <that limit>`. Codex shall get only the read-only tools until Codex is confirmed to ask before it calls an MCP tool. When the fence state is anything else, unknown or missing, or the task names no server, it shall name no server.

## Examples

- Given a task with a server and a fenced session,
  when Codex starts,
  then its arguments name `halonic-tools` with `--tools read-only`, as TOML strings.
- Given a session whose fence is `off`, `not-fenced`, `stopped`, an unknown state or none,
  when Codex starts,
  then no argument names `halonic-tools`.
