# harness-host.model-names

- Status: active
- Since: unreleased
- Source: HAL-12488 (plan approved by Liam in HAL-12505)

The builder `harnessHostOf` shall pass the host's model names, which turn an agent file's `model` alias into its provider's model id, to the engine as they are, and give the engine none when the host has none, so every name then goes to the program as written.

## Examples

- Given a host whose model names map `open-coder-agent` to `glm-5.3`,
  when the builder runs,
  then the engine's harness options hold those model names.
- Given a host with no model names,
  when the builder runs,
  then the engine's harness options hold none.
