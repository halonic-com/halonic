# harness-codex.pinned-settings

- Status: active
- Since: unreleased
- Source: HAL-16910

The Codex harness shall give Codex the settings of `harness-codex.config` that decide whom it talks to and what it may do on the command line too, as `-c` settings in every run: the bridge as the model provider (`model_provider`), the bridge provider's `wire_api`, `requires_openai_auth` and token header, asking for approvals on request (`approval_policy`), web search off (`web_search`), and the token header of the bridge's MCP server. They shall hold no token, only the name of the variable that holds it. The Codex harness shall refuse to start Codex when a folder Codex reads a project's own settings from holds `.codex/config.toml`: each folder from the working folder up to the nearest one that holds `.git`, or the working folder alone when none does. The refusal shall name the file and say what to do, and shall come before the settings folder is written and before Codex starts.

## Examples

- Given any run,
  when Codex's arguments are made,
  then they set `model_provider="halonic"`, `approval_policy="on-request"` and `web_search="disabled"`, and the bridge provider's and MCP server's token header, and hold no token.
- Given a working folder that holds `.codex/config.toml`,
  when a run starts,
  then Codex doesn't start and the run ends with an error that names the file.
- Given a workspace whose root holds `.git` and `.codex/config.toml`, and an agent working in a folder inside it,
  when a run starts,
  then Codex doesn't start.
- Given a `.codex/config.toml` in a folder above the nearest folder that holds `.git`,
  when a run starts,
  then Codex starts.
