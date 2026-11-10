# harness-claude-code.settings

- Status: active
- Since: 0.1.0
- Source: HAL-194 build plan C3; HAL-3586; decision 7 on HAL-2076

The Claude Code harness shall write the agent's settings folder before it starts Claude Code: a `settings.json` that turns Claude Code's own sandbox off and denies its `WebFetch` and `WebSearch` tools, and a `halonic-mcp.json` that names the bridge's MCP server at `/mcp` on the bridge's address, with the run token in the bridge's header. The files shall be the same whether the agent runs in a sandbox or on this computer. They shall take the bridge's address and the token from Claude Code's environment, so they hold no token and are the same for every run. A file that already holds the same text shall be left as it is.

## Examples

- Given an empty settings folder,
  when the settings are written,
  then `settings.json` has `sandbox.enabled` false and denies `WebFetch` and `WebSearch`.
- Given the settings are written for a run with a bridge token,
  when the folder's files are read,
  then none contains the token, and `halonic-mcp.json` names `${ANTHROPIC_BASE_URL}/mcp` and `${HALONIC_RUN_TOKEN}`.
- Given a settings folder whose files already hold the settings,
  when the settings are written again,
  then no file is written.
