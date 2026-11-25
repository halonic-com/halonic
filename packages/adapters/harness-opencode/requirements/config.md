# harness-opencode.config

- Status: active
- Since: unreleased
- Source: HAL-16826 (plan sections 1, 2 and 5, step 0 results, Liam's review); docs/adr/2026-11-24-opencode-harness-program.md; HAL-18101, checked with OpenCode 2.3.0

The OpenCode harness shall give OpenCode a config whose model and small model are the agent's model through the bridge's Anthropic-style provider at `<bridge>/v1`, with the run token's `x-halonic-run-token` header written as `{env:HALONIC_RUN_TOKEN}`; whose only MCP server is the bridge's at `<bridge>/mcp` with the same header; whose output limit is the alias's `maxTokens`, or 32,000; with `update: "disable"`, `share: "disabled"`, `snapshots: false`, no plugins, and LSP and formatters off; whose only instructions file is the session's; and which allows every tool but denies `webfetch`, `websearch`, `question`, `subagent`, `skill`, `execute`, `experimental_image_generate` and `external_directory`. The config shall hold no token. A task without a model shall be refused. The model catalog shall hold only the bridge's provider with the agent's model, priced at 0. The instructions file shall start with the fixed line from the decision note, then the agent's instructions.

## Examples

- Given a bridge at "http://127.0.0.1:4100/",
  when the config is built,
  then the provider's `baseURL` is "http://127.0.0.1:4100/v1" and the MCP server's `url` is "http://127.0.0.1:4100/mcp".
- Given an alias without `maxTokens`,
  when the config is built,
  then the model's output limit is 32,000.
