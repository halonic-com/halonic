# engine.harness-model-alias

- Status: active
- Since: unreleased
- Source: HAL-12488 (plan approved by Liam in HAL-12505, decision (b): the engine maps the alias, the bridge passes calls on unchanged)

When the engine starts a harness program for an agent whose file names a `model`, and the host gives model names, it shall ask the program for the model id that the host's `providerModelOf` gives for that name in the agent's hub, before it opens the call's bridge. When `providerModelOf` gives none, because the name is no alias, or when the host gives no model names, it shall ask for the `model` as written. When the agent's file names no model, it shall name none and ask nothing. When `providerModelOf` fails, the call shall fail with its error before the bridge, the sandbox or the program start.

## Examples

- Given an agent with `model: open-coder-agent`, an alias for `zai`'s `glm-5.2`,
  when the engine starts its harness program,
  then the program is asked for `glm-5.2`.
- Given an agent with `model: sonnet`, which is no alias,
  when the engine starts its harness program,
  then the program is asked for `sonnet`.
- Given a host whose model files can't be read,
  when the engine starts a harness program for an agent with a `model`,
  then the call fails with that error and nothing opens.
