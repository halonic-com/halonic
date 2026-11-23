# workspace-engine-node.read-only-trust

- Status: active
- Since: unreleased
- Source: HAL-17049; Liam's decision (d2) on HAL-17004: trust has one source of truth, so the agent host's engine role reads it through the same code as the CLI

The workspace engine's trust reader (`workspaceTrustState`) and its trust gate (`workspaceTrustGate`) shall answer where a workspace's trust stands on this computer, for the version the caller reads, with the same states the CLI uses: `not-needed` for a workspace that reaches only the test model, else the trust record's `trusted`, `new`, `changed` or `refused`. They shall count anything they can't read, the version included, as `unreadable`, never as `trusted`. They shall never write a trust record, not even to shrink a record whose workspace only lost connectors, and nothing the package exports shall grant trust. The gate shall answer with the caller's own sentence for each state, so the package holds no wording, and shall answer `trusted` for `not-needed`.

Rationale: the CLI and the Studio's background engine must never disagree about whether a workspace may start runs, and only a person at the computer may grant trust.

## Examples

- Given a workspace with a connector that starts a program and no trust record,
  when the reader is asked,
  then it answers `new`.
- Given a trusted workspace that has since lost one of its two connectors,
  when the reader is asked,
  then it answers `trusted`, and the trust store saw no write.
- Given a version that can't be read,
  when the reader is asked,
  then it answers `unreadable`.
- Given a workspace that reaches only the test model,
  when the gate checks,
  then it answers `trusted` with the caller's `not-needed` sentence.
