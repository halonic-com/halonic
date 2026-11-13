# ports.secret-store

- Status: active
- Since: 0.1.0
- Source: HAL-195 (PR 9a-1, approved by Liam on HAL-8325)

The ports package shall describe `SecretStore` as `Secrets` that can also be written: `set(name, value)`, `remove(name)` and `names()`, sharing the version of `Secrets`. It shall export `checkSecretValue`, which refuses an empty value, or one longer than `maxSecretValueLength` (65,536 characters), with a `RangeError` that gives only the length. A host that only reads secrets keeps implementing `Secrets` alone.

## Examples

- Given a `SecretStore`, when it is used as `Secrets`, then it type-checks.
- Given `checkSecretValue("")`, then it throws a `RangeError`.
- Given a value of 65,537 characters, then `checkSecretValue` throws a `RangeError` whose message holds the length and none of the value.
