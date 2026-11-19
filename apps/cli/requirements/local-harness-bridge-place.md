# cli.local-harness-bridge-place

- Status: active
- Since: unreleased
- Source: HAL-13090 (found by Nina on HAL-13084, confirmed by Liam on HAL-13089)

The CLI's harness host shall serve each run's bridge where that run's program can reach it. A run in the sandbox shall get its bridge on a Unix socket in the profile on Linux and macOS, which the sandbox's proxy reaches (W9, HAL-6316), and on a loopback port elsewhere. A run a person set to "On this computer" has no sandbox and no proxy, so its bridge shall always be on a loopback port, which the launcher accepts; the run's own token still guards it.

## Examples

- Given the coder set to "On this computer", on Linux or macOS, with this computer's launcher and bridge servers,
  when its run starts,
  then the launcher opens it with a loopback bridge, and the run completes.
- Given the coder in the sandbox, on Linux or macOS, with this computer's bridge servers,
  when its run starts,
  then its sandbox profile names a bridge on a Unix socket.
