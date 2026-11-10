# harness-claude-code.settings

- Status: active
- Since: 0.1.0
- Source: HAL-194 build plan C3, B7; HAL-3586; HAL-4000; decision 7 on HAL-2076

The Claude Code harness shall write the agent's settings folder before it starts Claude Code: a `settings.json` that turns Claude Code's own sandbox off, denies its `WebFetch` and `WebSearch` tools and allows the tools of the bridge's `halonic` MCP server, which the bridge checks and asks about itself, and a `halonic-mcp.json` that names two MCP servers on the bridge's address, each with the run token in the bridge's header: `halonic` at `/mcp`, with Halonic's tools, and `halonic-approvals` at `/mcp/permission-prompt`, with the `approve_permission` tool. The files shall be the same whether the agent runs in a sandbox or on this computer. They shall take the bridge's address and the token from Claude Code's environment, so they hold no token and are the same for every run. A file that already holds the same text shall be left as it is.

## Examples

- Given an empty settings folder,
  when the settings are written,
  then `settings.json` has `sandbox.enabled` false, allows `mcp__halonic` and denies `WebFetch` and `WebSearch`.
- Given the settings are written for a run with a bridge token,
  when the folder's files are read,
  then none contains the token, and `halonic-mcp.json` names `${ANTHROPIC_BASE_URL}/mcp`, `${ANTHROPIC_BASE_URL}/mcp/permission-prompt` and `${HALONIC_RUN_TOKEN}`.
- Given a settings folder whose files already hold the settings,
  when the settings are written again,
  then no file is written.
