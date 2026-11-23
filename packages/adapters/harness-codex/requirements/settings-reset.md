# harness-codex.settings-reset

- Status: active
- Since: unreleased
- Source: HAL-16910

Before each run, the Codex harness shall reset the agent's settings folder (`CODEX_HOME`) as `harness-kit.settings-folder-reset` says, keeping only its `config.toml` and the sign-in in `auth.json`, so that what a run left there, such as an `AGENTS.md`, a `rules` folder or a `skills` folder, doesn't reach a later run.

## Examples

- Given a settings folder that holds `auth.json`, an `AGENTS.md`, a `rules` folder and a `skills` folder,
  when a run starts,
  then before Codex starts the folder holds only `auth.json`, unchanged, and `config.toml`.
