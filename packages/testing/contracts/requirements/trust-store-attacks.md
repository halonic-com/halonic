# contracts.trust-store-attacks

- Status: active
- Since: 0.1.0
- Source: HAL-1551, HAL-2241; `TrustStore` port v1; the attack cases of `contracts.trust-fingerprint`

Where an adapter implements `TrustStore`, it shall give back a trust record granted for a workspace's connectors with the same trust content and fingerprint, so that its fingerprint no longer matches the workspace after any of the attacker edits of `contracts.trust-fingerprint`, and still matches after each of its harmless rewrites.

## Examples

- Given a record granted for a program connector,
  when the workspace adds `NODE_OPTIONS=--require ./x.js` to its variables,
  then the stored fingerprint differs from the workspace's new one.
- Given a record granted for an HTTP connector at `https://bücher.acme.test/v1/mcp`,
  when the workspace writes the host as `xn--bcher-kva.acme.test`,
  then the stored fingerprint still matches.
- Given a record granted for a workspace,
  when it is read back from the store,
  then its content and fingerprint are the ones that were granted.
