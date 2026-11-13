# oauth-sign-in.approved-sign-in-hash

- Status: active
- Since: 0.1.0
- Source: HAL-8323 (HAL-984 design, section 4, "The grant belongs to the sign-in the user approved")

The sign-in shall fingerprint an approved sign-in as `sha256:` and the hex SHA-256 of its resolved values in canonical JSON, so that a change to any resolved value changes the hash and a change in the order of scopes or hosts does not.

## Examples

- Given an approved sign-in and a copy with another `tokenUrl`, `revokeUrl`, `clientId`, `clientSecretName`, scope or access host,
  then the hashes differ.
- Given a copy whose scopes and access hosts are in another order,
  then the hashes are equal.
