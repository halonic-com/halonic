# password-scrypt.no-work-before-refusal

- Status: active
- Since: 0.1.0
- Source: HAL-195 (phase 4); `ports.password-hash-format` ("a `RangeError` is thrown before any scrypt work starts")

When `verify` is given a hash that is malformed, in another format or out of range, the hasher shall reject with a `RangeError` before it starts any scrypt work, and the error shall not repeat the hash.

## Examples

- Given every out-of-range, malformed and other-format hash of the contract cases,
  when each is verified,
  then each rejects with a `RangeError` and no scrypt work is done.
- Given a hash with `=` added to its salt,
  when it is verified,
  then the error doesn't contain the salt.
