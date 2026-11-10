# Decision: what the Codex harness puts in `config.toml`, and what on the command line

- Approval: [HAL-3998](/HAL/issues/HAL-3998)
- Kind: internal

Build plan D3 says `config.toml` in `CODEX_HOME` points Codex at the bridge.
`CODEX_HOME` is the agent's settings folder, which all its runs share, but
each run has its own bridge on its own port.

What changes:

- `config.toml` holds only what is the same for every run: the provider,
  Codex's sandbox off, approvals on request, web search off and the bridge's
  MCP server, with the token header read from `HALONIC_RUN_TOKEN`.
- The bridge's address goes on the command line, as two `-c` settings,
  which Codex applies to that one process. Two runs of one agent at the same
  time then can't rewrite each other's file. The address holds no secret.
- `approval_policy = "on-request"`: Codex asks only when it wants an OK.
  `untrusted` would stop an unattended run at nearly every command, and
  Halonic's sandbox is the fence either way.
- `requires_openai_auth = true`: checked with Codex 0.166.0, a run with no
  sign-in still sends no `Authorization`, and a signed-in person's sign-in
  can reach the bridge for B5. Check 1 (D4) confirms the sign-in path.

Risk: a later Codex that renames one of these settings would ignore it.
The test pins the text, and D4's manual check reads it back with
`config/read`.

## Covers

- harness-codex.config
