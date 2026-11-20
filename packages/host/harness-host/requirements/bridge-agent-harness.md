# harness-host.bridge-agent-harness

- Status: active
- Since: unreleased
- Source: HAL-12488 (Julian's security review on HAL-13515: a keyed provider must suit the agent's harness)

When the bridge host opens a harness run's bridge, it shall tell the host's `servicesFor` the harness the agent's call runs in, as the engine gives it, so a host that resolves the agent's model gives only a provider that harness's program can speak.

## Examples

- Given a Codex agent,
  when its run's bridge opens,
  then `servicesFor` is told the harness `codex`.
