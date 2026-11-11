# harness-codex.sign-in-command

- Status: active
- Since: 0.1.0
- Source: board answer on HAL-5355 (option 1, a "Sign in for this agent" button in Studio); task HAL-5395

The Codex harness shall name its program's own sign-in as its `signIn`: the `codex` program with `login`, pointed at the agent's settings folder through `CODEX_HOME`, the same variable its `environment` sets for a run, so a person who signs in for an agent signs in where that agent's runs look. It shall never name the person's own settings folder.

## Examples

- Given the Codex harness,
  when its `signIn` is read,
  then it is `codex login` with the variable `CODEX_HOME`.
- Given a profile whose settings folder is "/agents/writer/settings",
  when the harness's environment is asked for,
  then `CODEX_HOME` is "/agents/writer/settings", the folder the sign-in is pointed at.
