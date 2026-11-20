# harness-host.bridge-placement

- Status: active
- Since: unreleased
- Source: HAL-13090 (found by Nina on HAL-13084, confirmed by Liam on HAL-13089)

The bridge host shall take one bridge server per placement from the host, and open each harness run's bridge on the server for the placement the engine names: the fenced sandbox's server for `sandbox`, and the launcher's for `this-computer`. So a host can serve a fenced program's bridge on a Unix socket its sandbox's proxy reaches, and an unfenced program's on loopback, which it can reach without a proxy.

## Examples

- Given a host with one bridge server for the sandbox and another for this computer,
  when the engine opens a bridge for `this-computer` and then one for `sandbox`,
  then each opens on its own placement's server, once.
