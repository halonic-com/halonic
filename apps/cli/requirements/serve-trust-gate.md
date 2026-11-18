# cli.serve-trust-gate

- Status: active
- Since: unreleased
- Source: HAL-195 (9b-1); `server.trust-gate`; phase 4 plan on HAL-9 (the host enforces the trust gate)

The trust gate of `halonic serve` shall, at every check, load the served workspace's files and the programs its connectors name, and ask the trust record, so a workspace that changed after it was trusted answers `changed` at once. It shall answer `trusted`, with a sentence of its own, for a workspace that reaches only the test model, which needs no trust (HAL-12011). It shall report `trusted`, `new`, `changed`, `unreadable` or `refused`, with one short sentence that names no file, path or fingerprint. It shall count anything it can't read as `unreadable`, never as `trusted`. It shall have no way to grant or change trust.

Rationale: the server's routes that start a run ask the gate again every time, so a workspace edited behind a running server stops starting runs until a person trusts it again with `halonic trust`.

## Examples

- Given a workspace trusted on this computer,
  when the gate checks,
  then it answers `trusted`.
- Given a trusted workspace whose connector file was edited,
  when the gate checks,
  then it answers `changed`, without a restart.
- Given a workspace that was never trusted,
  when the gate checks,
  then it answers `new`.
- Given a workspace that reaches only the test model and has no trust record,
  when the gate checks,
  then it answers `trusted` with "This workspace needs no trust: it reaches only the test model.",
  and `new` at once after a connector or a real provider is added.
- Given a trust record that can't be read,
  when the gate checks,
  then it answers `unreadable`.
