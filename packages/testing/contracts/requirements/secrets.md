# contracts.secrets

- Status: active
- Since: 0.1.0
- Source: HAL-114; plan 4.3; `Secrets` port v1

Where an adapter implements `Secrets`, it shall give a configured secret's value, or `null` for one that isn't configured, and treat two names that differ only in upper and lower case, or in `-` versus `_`, as the same secret. When a name isn't `^[A-Za-z][A-Za-z0-9_-]*$` or is longer than 128 characters, `get` shall reject with a `RangeError`. A name that only looks like a valid one (a Unicode lookalike, or a character that case-folds to ASCII) shall be such a `RangeError`, never another secret's value, and a valid name that is also a property of every JavaScript object, such as `constructor`, shall give `null` unless it is configured. The error shall not repeat a name that is over 128 characters or holds a character that isn't printable ASCII.

## Examples

- Given `serve-password` is configured,
  when `SERVE_PASSWORD` or `Serve-Password` is read,
  then it gives the same value.
- Given any adapter,
  when `../serve-password`, `serve password` or a 129-character name is read,
  then it rejects with a `RangeError`.
- Given `serve-password` is configured,
  when `ſerve-password` (with a long s, which upper-cases to `S`) is read,
  then it rejects with a `RangeError`.
- Given no secret is configured,
  when `constructor` is read,
  then it gives `null`.
- Given a 128-character name that is configured,
  when it is read,
  then it gives its value.
- Given any adapter,
  when a 135-character name or `sérve-password` is read,
  then the `RangeError` doesn't repeat the name.
