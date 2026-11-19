# agent-host-client.bridge-agent-harness

- Status: active
- Since: unreleased
- Source: HAL-13573 (Liam's review on HAL-13517 and Julian's security review on HAL-13515: a keyed provider must suit the agent's harness)

When the stand-in bridge host opens an agent's bridge, it shall tell Studio's `servicesFor` the harness the agent's call runs in, as the engine gives it, so Studio gives only a provider that harness's program can speak.

## Examples

- Given a Codex agent,
  when the engine opens its bridge,
  then `servicesFor` is told the harness `codex`.
