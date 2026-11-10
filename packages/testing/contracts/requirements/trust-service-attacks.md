# contracts.trust-service-attacks

- Status: active
- Since: 0.1.0
- Source: HAL-1551; `app.trust-service`; the attack cases of `contracts.trust-fingerprint`

Where the trust check runs over a `TrustStore` adapter, after a person trusted a workspace, it shall give no grant for the workspace after any of the attacker edits of `contracts.trust-fingerprint`, so a connector gets `trust: null` and its program never starts, and it shall leave the stored record as it was. After each harmless rewrite of `contracts.trust-fingerprint` it shall still give the grant the person made, without writing to the record.

## Examples

- Given a workspace a person trusted,
  when an attacker adds `NODE_OPTIONS=--require ./x.js` to a program's variables,
  then the check gives no grant, the stored record is unchanged, and the workspace as it was is still trusted.
- Given a workspace a person trusted,
  when the workspace lists its connectors in another order,
  then the check gives the same grant and writes nothing.
- Given a workspace nobody trusted,
  when it is checked,
  then the check gives no grant and the store stays empty.
