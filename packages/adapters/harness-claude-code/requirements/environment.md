# harness-claude-code.environment

- Status: active
- Since: 0.1.0
- Source: HAL-194 build plan C1 and C3, decision 4; HAL-2552; HAL-3586; HAL-1710 check 3

The Claude Code harness shall set `ANTHROPIC_BASE_URL` to the run's bridge, put the run token in the `x-halonic-run-token` header through `ANTHROPIC_CUSTOM_HEADERS`, set `CLAUDE_CONFIG_DIR` to the agent's settings folder and always set `CLAUDE_CODE_TMPDIR` to the session's own temp folder. It shall also put the run token in `HALONIC_RUN_TOKEN`, which the MCP settings name in the bridge's header. None of its variables shall clash with what the engine sets. If the profile has no settings folder, then it shall fail with an error that holds no token. The function shall also be the entry point `@halonicjs/adapter-harness-claude-code/environment`, which imports nothing but `@halonicjs/ports`, so Studio's page can load it (HAL-4878).

## Examples

- Given a bridge at "http://127.0.0.1:4100" and a profile with a settings and a temp folder,
  when the engine opens a session with the harness's environment,
  then the program gets all five variables, and the token only in `ANTHROPIC_CUSTOM_HEADERS` and `HALONIC_RUN_TOKEN`.
- Given a profile whose settings folder is `null`,
  when the environment is asked for,
  then it fails with an error that doesn't contain the token.
- Given Studio's page, which can't load Node modules,
  when it imports `@halonicjs/adapter-harness-claude-code/environment`,
  then it loads, because that entry imports only `@halonicjs/ports`.
