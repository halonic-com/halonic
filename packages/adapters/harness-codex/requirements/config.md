# harness-codex.config

- Status: active
- Since: 0.1.0
- Source: HAL-194 build plan D3, decision 4; decision 7 on HAL-2076; HAL-3998; HAL-10521

The Codex harness shall give Codex a `config.toml` in its `CODEX_HOME` whose model provider is the bridge's, with the OpenAI Responses API and the run token in the `x-halonic-run-token` header read from `HALONIC_RUN_TOKEN`; that turns Codex's own sandbox off (`danger-full-access`) inside Halonic's fence, has Codex ask for approvals on request, turns web search off, and names the bridge's MCP server with the same header. The file shall be the same for every run and wherever the agent runs, in a sandbox or on this computer, and hold neither the bridge's address nor the token. The bridge's address shall reach Codex on the command line, as `-c` settings for the model provider (`/v1`) and the MCP server (`/mcp`), whether or not the address ends with `/`. Outside the fence, where `harness-kit.own-sandbox` says Codex's own sandbox works, the command line shall also turn it on with `-c sandbox_mode="workspace-write"`; inside the fence it shall not, and shall not ask. The command line shall also stop Codex from reading instructions out of the working folder, which a person didn't trust as they are now: `-c project_doc_max_bytes=0` for the folder's `AGENTS.md` and `AGENTS.override.md`, and `-c skills.include_instructions=false` for the skills in its `.agents/skills`, in every run, inside the fence and outside it. The agent's instructions shall reach Codex only as the pinned text, and no skill shall reach it from the working folder. A value written as a TOML string shall be escaped as TOML requires, and a string TOML can't hold shall be refused.

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
- Given a run outside the fence where Codex's own sandbox works,
  when Codex's arguments are made,
  then they also set `sandbox_mode` to `workspace-write`, and `config.toml` stays the same.
- Given a working folder with an `AGENTS.md`, an `AGENTS.override.md` and a skill in `.agents/skills`,
  when Codex's arguments are made,
  then they set `project_doc_max_bytes=0` and `skills.include_instructions=false`, so Codex's request holds none of the three.
