# agent-host-client.bridge-provider-keys

- Status: active
- Since: unreleased
- Source: HAL-13795 (plan and Liam's changes approved on HAL-13795; the CLI's rules from HAL-12784)

The `AgentHostBridges` class shall tell Studio's `servicesFor` the harness the agent's call runs in and where the agent runs for that call, as the engine opens its bridge, so Studio decides which provider access the bridge gets as the CLI does (`harness-host.provider-access`). The bridge it gives the engine shall name in its `keyProviders` the providers Studio sent the host with a key Halonic keeps, by the same rule as the Node bridge (`harness-bridge.key-providers`), so the harness's environment gives the program a stand-in key; it names none when every provider keeps the program's own sign-in. Before the run log records a `bridge.failed` from the host, it shall remove from its message every key value the `scrub` Studio gives removes, after the run token.

## Examples

- Given the engine opens a Claude Code agent's bridge for the sandbox,
  when Studio's `servicesFor` is asked,
  then it is told the harness `claude-code` and `sandbox`; for "On this computer", `this-computer`.
- Given Studio serves Anthropic with a key,
  when the bridge opens,
  then the bridge names `anthropic` in its `keyProviders`; with the program's own sign-in, it has none.
- Given a `scrub` that removes a key Studio handed the bridge,
  when the host reports a failure whose message quotes that key,
  then the run log records the message with the key removed.
