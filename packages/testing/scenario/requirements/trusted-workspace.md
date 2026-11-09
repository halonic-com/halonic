# scenario.trusted-workspace

- Status: active
- Since: 0.1.0
- Source: HAL-1931; HAL-65 requirements ("Tests in other features"), HAL-188 build item 4

When `trustedWorkspace(location, input)` is called, the scenario package shall return a memory `TrustStore` that holds exactly one record, for `location`. The record's content shall be `trustContent(input)` and its fingerprint the `hfp1:` SHA-256 fingerprint of that content, so the trust gate lets a run on the workspace through and the parity harness keeps identical event logs. The command paths in `input` shall reach the fingerprint, as they do in `TrustService`. The record shall be granted at `2026-01-01T00:00:00.000Z`, the parity clock's start, never at the real time.

## Examples

- Given a workspace with one program connector,
  when `trustedWorkspace` trusts it,
  then the store lists one record with that workspace's trust content and fingerprint, granted at `2026-01-01T00:00:00.000Z`.
- Given a trusted workspace whose connector then gains an argument,
  when its fingerprint is worked out again,
  then it differs from the stored one.
- Given the same connectors with and without a resolved path for `node`,
  when each is trusted,
  then the two fingerprints differ.
- Given a store that trusts `/workspaces/acme`,
  when `/workspaces/zeta` is looked up,
  then there is no record.
