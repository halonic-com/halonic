# engine.harness-bridge-placement

- Status: active
- Since: unreleased
- Source: HAL-13090 (found by Nina on HAL-13084, confirmed by Liam on HAL-13089)

When the engine opens a harness call's bridge, it shall tell the host the placement the call's sandbox is for (`sandbox` or `this-computer`), the same answer it chose that sandbox from, so the host can serve the bridge where that sandbox's program can reach it, and the bridge and the sandbox never come from two different answers.

## Examples

- Given a `writer` agent placed in a sandbox,
  when its harness call opens its bridge,
  then the host is told `sandbox`.
- Given a `writer` agent a person set to "On this computer",
  when its harness call opens its bridge,
  then the host is told `this-computer`, and the launcher's session opens.
