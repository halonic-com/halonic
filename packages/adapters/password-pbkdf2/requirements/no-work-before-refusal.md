# password-pbkdf2.no-work-before-refusal

- Status: active
- Since: 0.1.0
- Source: HAL-6799; [HAL-136](/HAL/issues/HAL-136#document-decision) ("the runtime refuses unknown or weaker parameters")

When `verify` is given a hash that is malformed, in another format or out of range, the hasher shall reject with a `RangeError` before it starts any PBKDF2 work, and the error shall not repeat the hash. For a valid hash it shall run PBKDF2 exactly as many times as the hash's `n` says.

## Examples

- Given every out-of-range, malformed and other-format hash of the contract cases,
  when each is verified,
  then each rejects with a `RangeError` and `crypto.subtle.deriveBits` is never called.
- Given the n = 7 vector,
  when it is verified with its password,
  then `verify` gives `true` after exactly 7 calls to `deriveBits`.
- Given a hash with `=` added to its salt,
  when it is verified,
  then the error doesn't contain the salt.
