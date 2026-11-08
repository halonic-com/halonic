# contracts.secrets

- Status: active
- Since: 0.1.0
- Source: HAL-114; plan 4.3; `Secrets` port v1

Every `Secrets` adapter shall give a configured secret's value, or `null` for one that isn't configured, and treat two names that differ only in upper and lower case, or in `-` versus `_`, as the same secret. When a name isn't `^[A-Za-z][A-Za-z0-9_-]*$` or is longer than 128 characters, `get` shall reject with a `RangeError`.

## Examples

- Given `serve-password` is configured,
  when `SERVE_PASSWORD` or `Serve-Password` is read,
  then it gives the same value.
- Given any adapter,
  when `../serve-password`, `serve password` or a 129-character name is read,
  then it rejects with a `RangeError`.
- Given a 128-character name that is configured,
  when it is read,
  then it gives its value.
