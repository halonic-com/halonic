# harness-claude-code.sign-in-command

- Status: active
- Since: 0.1.0
- Source: board answer on HAL-5355 (option 1, a "Sign in for this agent" button in Studio); task HAL-5395

The Claude Code harness shall name its program's own sign-in as its `signIn`: the `claude` program with `auth login`, pointed at the agent's settings folder through `CLAUDE_CONFIG_DIR`, the same variable its `environment` sets for a run, so a person who signs in for an agent signs in where that agent's runs look. It shall never name the person's own settings folder.

## Examples

- Given the Claude Code harness,
  when its `signIn` is read,
  then it is `claude auth login` with the variable `CLAUDE_CONFIG_DIR`.
- Given a profile whose settings folder is "/agents/writer/settings",
  when the harness's environment is asked for,
  then `CLAUDE_CONFIG_DIR` is "/agents/writer/settings", the folder the sign-in is pointed at.
