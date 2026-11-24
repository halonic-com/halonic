# Decision: harnesses name the coding tools server for fenced runs only, after an outside check

- Approval: Paperclip task HAL-16753 (PR 4 of the HAL-16737 plan, Liam's conditions on HAL-16748 and HAL-16752); Liam approves this note in review
- Kind: internal

The coding tools server (`read_ranges`, `search`, `repo_map`, `run_tests`) runs as a child of the agent's program, inside its fence. This changes three existing requirements and adds three.

- `harness-claude-code.settings`: `settings.json` now allows the three read-only coding tools and has an `ask` rule for `mcp__halonic-tools__run_tests`. In Claude Code an `ask` rule wins over every `allow` rule, so no settings file and no "always allow" answer lets a `run_tests` call skip the person's approval card. `--setting-sources user` already keeps a project's `.claude/settings.json` out.
- `harness-claude-code.environment`: the example said "six variables"; since #5406 Claude Code gets seven (`ENABLE_TOOL_SEARCH=false`). Wording only.
- `engine.run-harness`: the engine passes the server the profile builder named on to the harness.
- New: `harness-kit.coding-tools-server` (the outside check, and the fenced-only command), `harness-claude-code.coding-tools`, `harness-codex.coding-tools`.

Why this shape:

- The outside check is the one that counts. The profile builder names the server only when none of its code paths is, holds or lies inside a folder the program may write, and none is denied; it opens the code read-only. The server's own check at start can't catch code rewritten before it started.
- Fenced runs only. Outside Halonic's fence a program's own sandbox wraps only its shell commands, so an MCP server would run unfenced. An unknown or missing fence state names no server.
- Codex gets `--tools read-only` until Codex is confirmed to ask before it calls an MCP tool.
- No host passes a server yet, so this PR changes no run. The hosts' `coding-tools` mode (CLI, agent host, WSL runtime) and the sandbox `.starts.test` follow in the next PR.

## Covers

- harness-claude-code.settings
- harness-claude-code.environment
- engine.run-harness
