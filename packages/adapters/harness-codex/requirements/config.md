# harness-codex.config

- Status: active
- Since: 0.1.0
- Source: HAL-194 build plan D3, decision 4; decision 7 on HAL-2076; HAL-3998

The Codex harness shall give Codex a `config.toml` in its `CODEX_HOME` whose model provider is the bridge's, with the OpenAI Responses API and the run token in the `x-halonic-run-token` header read from `HALONIC_RUN_TOKEN`; that turns Codex's own sandbox off (`danger-full-access`), has Codex ask for approvals on request, turns web search off, and names the bridge's MCP server with the same header. The file shall be the same for every run and wherever the agent runs, in a sandbox or on this computer, and hold neither the bridge's address nor the token. The bridge's address shall reach Codex on the command line, as `-c` settings for the model provider (`/v1`) and the MCP server (`/mcp`). A value written as a TOML string shall be escaped as TOML requires, and a string TOML can't hold shall be refused.

## Examples

- Given the harness's `config.toml`,
  when it is read,
  then it sets `web_search = "disabled"`, `sandbox_mode = "danger-full-access"` and `approval_policy = "on-request"`, and holds no token and no address.
- Given a bridge at `http://127.0.0.1:4100`,
  when Codex's arguments are made,
  then they set `model_providers.halonic.base_url` to `http://127.0.0.1:4100/v1` and `mcp_servers.halonic.url` to `http://127.0.0.1:4100/mcp`.
- Given a string with a quote, a backslash, a line break and the delete character,
  when it is written as a TOML string,
  then each is escaped.
