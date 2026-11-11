# harness-codex.environment

- Status: active
- Since: 0.1.0
- Source: HAL-194 build plan D1 and D3, decision 4; HAL-2608 (Codex's `env_http_headers`, checked in its source)

The Codex harness shall set `CODEX_HOME` to the agent's settings folder and put the run token in `HALONIC_RUN_TOKEN`, the variable the bridge provider in its `config.toml` reads the `x-halonic-run-token` header from. The token shall be in no other variable. None of its variables shall clash with what the engine sets. If the profile has no settings folder, then it shall fail with an error that holds no token. The function shall also be the entry point `@halonicjs/adapter-harness-codex/environment`, which imports nothing but `@halonicjs/ports`, so Studio's page can load it (HAL-4878).

## Examples

- Given a bridge and a profile with a settings folder,
  when the engine opens a session with the harness's environment,
  then the program gets `CODEX_HOME` and `HALONIC_RUN_TOKEN`, and the token only in `HALONIC_RUN_TOKEN`.
- Given a profile whose settings folder is `null`,
  when the environment is asked for,
  then it fails with an error that doesn't contain the token.
- Given Studio's page, which can't load Node modules,
  when it imports `@halonicjs/adapter-harness-codex/environment`,
  then it loads, because that entry imports only `@halonicjs/ports`.
