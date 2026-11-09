# contracts.trust-store

- Status: active
- Since: 0.1.0
- Source: HAL-181 (decided there: the port only stores, `TrustService` decides); `TrustStore` port v1

Where an adapter implements `TrustStore`, it shall give back every field of a granted record, `null` for a location it has no record for, and an empty list when it holds none. Granting a location again shall replace its record, and revoking shall delete it; revoking a location without a record shall not be an error. It shall keep one record per location, compare locations exactly as given, and list records sorted by location. It shall keep what was granted, whatever the caller later does with the objects it passed in or got back. When a stored record can't be read, `get` for that location and `list` shall reject with an error that names the location, while other locations still read; `revoke` shall delete that record, and granting the location again shall replace it.

## Examples

- Given a record for `/workspaces/acme` with fingerprint `hfp1:old`,
  when the same location is granted with `hfp1:new`,
  then `get` gives the new record and `list` holds one record.
- Given a record for `/workspaces/acme`,
  when `/workspaces/acme/` or `/Workspaces/acme` is read,
  then it gives `null`.
- Given records for `/workspaces/acme` and `/workspaces/zeta`, and the first can't be read,
  when `get("/workspaces/acme")` or `list()` is called,
  then it rejects with an error naming `/workspaces/acme`, and `get("/workspaces/zeta")` still gives its record.
- Given a record that can't be read,
  when it is revoked,
  then `get` gives `null` and `list` gives `[]`.
