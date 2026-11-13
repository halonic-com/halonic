# memory.secret-store

- Status: active
- Since: 0.1.0
- Source: HAL-195 (PR 9a-1); `SecretStore` in the `Secrets` port family

The memory secret store shall keep each secret under its name in upper case with `-` as `_`, remember the name as it was last written for `names()`, and refuse an empty value or one over the limit with a `RangeError`. It keeps nothing past the object's life.

## Examples

- Given `Open-AI` is set to `one`, when `open_ai` is read, then it gives `one`, and `names()` reads `Open-AI`.
