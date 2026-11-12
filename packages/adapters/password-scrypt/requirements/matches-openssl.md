# password-scrypt.matches-openssl

- Status: active
- Since: 0.1.0
- Source: HAL-195 (phase 4); `ports.password-hash-format` (vectors checked against an independent implementation)

The scrypt hasher shall accept exactly the keys Node's scrypt (OpenSSL) computes for the same password, salt and settings, so a hash made by one verifies in the other.

## Examples

- Given each vector of the contract cases, ln=15 included,
  when its key is recomputed with `crypto.scryptSync`,
  then it equals the vector's key, and `verify` gives `true`.
