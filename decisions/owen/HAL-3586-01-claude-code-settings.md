# Decision: Claude Code gets the run token in `HALONIC_RUN_TOKEN` too

- Approval: [HAL-3586](/HAL/issues/HAL-3586)
- Kind: internal

C3 writes Claude Code's settings folder, which names the bridge's MCP
server. That server needs the run token in the bridge's header, like every
model request. `ANTHROPIC_CUSTOM_HEADERS` only covers model requests, and
the token must never be written into a file, because the settings folder
outlives the run.

What changes:

- `claudeCodeEnvironment` also sets `HALONIC_RUN_TOKEN` to the run token.
  The MCP settings name it as `${HALONIC_RUN_TOKEN}`, and Claude Code fills
  it in when it reads them. This is the same pattern as Codex's
  `HALONIC_RUN_TOKEN` (`harness-codex.environment`).
- `harness-claude-code.environment` says so, and its example says the token
  is in `ANTHROPIC_CUSTOM_HEADERS` and `HALONIC_RUN_TOKEN`, instead of in
  `ANTHROPIC_CUSTOM_HEADERS` only. Nothing is removed.

Risk: the token is in one more variable of the program's environment, which
already held it. The sandbox passes the environment only to Claude Code.

## Covers

- harness-claude-code.environment
