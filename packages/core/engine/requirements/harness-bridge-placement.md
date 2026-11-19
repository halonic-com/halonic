# engine.harness-bridge-placement

- Status: active
- Since: unreleased
- Source: HAL-13796 (an agent set to "On this computer" couldn't reach a bridge on a Unix socket)

When the engine opens a harness run's bridge, it shall tell the bridge host where the agent runs, as the placement policy answered: `sandbox` or `this-computer`. A program on this computer has no sandbox proxy, so the host can then open its bridge where that program can reach it.

## Examples

- Given the `writer` agent, placed in the sandbox,
  when its harness run starts,
  then the bridge host is asked for its bridge on `sandbox`.
- Given the `writer` agent, which a person chose to run on this computer,
  when its harness run starts,
  then the bridge host is asked for its bridge on `this-computer`.
