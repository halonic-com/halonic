# cli.local-harness-host-bridges

- Status: active
- Since: unreleased
- Source: HAL-13796 (found in the real run for HAL-12784)

The CLI's harness host shall open the bridge of an agent in the sandbox on a Unix socket in a private `bridges` folder of the profile on Linux and macOS, which only the sandbox's proxy reaches, and on a loopback port elsewhere. It shall open the bridge of an agent a person set to "On this computer" on a loopback port on every system, since the launcher starts its program without a fence and so without a proxy to reach a socket through. Both bridges shall be Node's, read no secret, and answer only requests with the run's token.

## Examples

- Given a coder agent set to "On this computer" on Linux, with this computer's launcher and Node's bridges,
  when its program asks the bridge's loopback address without the run's token,
  then the bridge answers `401`, and the run completes.
