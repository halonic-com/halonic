# contracts.password-hasher

- Status: draft
- Since: 0.1.0
- Source: HAL-6799 (Cloud track part 8); `PasswordHasher` port v1, two formats decided on HAL-6789

Where an adapter implements `PasswordHasher`, it shall make every new hash in its one format with the current settings and its own random salt, so `needsRehash` gives `false` for it and two hashes of one password differ. `verify` shall give `true` for the password a hash was made from and `false` for any other. A hash in another format (the port's other format included) or text that isn't a hash shall make `verify` reject and `needsRehash` throw with a `RangeError`, never give `false`. The format's own vectors, ranges and malformed hashes come from its requirement in `core/ports` and run in the same suite.

## Examples

- Given a new hash of "a long made-up password",
  when it is verified with that password and with "a long made-up passwort",
  then `verify` gives `true` and then `false`, and `needsRehash` gives `false`.
- Given two hashes of "same password",
  when they are compared,
  then they differ.
- Given the chained PBKDF2 adapter and the scrypt vector `$scrypt$ln=14,r=8,p=5$…`, or the text `not a hash`,
  when it is verified,
  then it rejects with a `RangeError`.
