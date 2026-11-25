# harness-opencode.environment

- Status: active
- Since: unreleased
- Source: HAL-16826 (plan sections 1 to 3, step 0 results, Liam's review); HAL-18101, checked with OpenCode 2.3.0

The OpenCode harness shall run OpenCode with every `OPENCODE_DISABLE_*` switch that version ships set to `1`; `HOME` in the agent's settings folder, because the sandbox passes none and OpenCode would otherwise use the account's own home folder; its config in `OPENCODE_CONFIG_CONTENT`; `OPENCODE_CONFIG_DIR`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_CACHE_HOME`, `OPENCODE_DB` and `OPENCODE_MODELS_PATH` inside the agent's settings folder, never the person's own folders; the run token in `HALONIC_RUN_TOKEN`; and, only when the bridge keeps Anthropic's key, a stand-in Anthropic key that holds no secret. The session's instructions file shall be in the session's own temp folder. A profile without a settings folder shall be refused. The token shall appear in no value but `HALONIC_RUN_TOKEN`.

## Examples

- Given a bridge that keeps Anthropic's key,
  when the environment is built,
  then `ANTHROPIC_API_KEY` is the stand-in, and `OPENCODE_CONFIG_CONTENT` doesn't hold the token.
- Given a bridge reached with the program's own sign-in,
  when the environment is built,
  then it has no `ANTHROPIC_API_KEY`.
