# harness-claude-code.settings-reset

- Status: active
- Since: unreleased
- Source: HAL-16910

When a run starts, the Claude Code harness shall first reset the agent's settings folder (`CLAUDE_CONFIG_DIR`) as `harness-kit.settings-folder-reset` says, keeping only the files of `harness-claude-code.settings` and the sign-in in `.credentials.json` and `.claude.json`, so that what a run left there, such as a `CLAUDE.md` or a `skills`, `agents` or `commands` folder, doesn't reach a later run.

## Examples

- Given a settings folder that holds `.credentials.json`, `.claude.json`, a `CLAUDE.md` and `skills`, `agents` and `commands` folders,
  when a run starts,
  then before Claude Code starts the folder holds only the two sign-in files, unchanged, `settings.json`, `halonic-mcp.json` and `halonic-unfenced.json`.
