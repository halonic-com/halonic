# adapter-memory.secrets

- Status: active
- Since: 0.1.0
- Source: HAL-114; `Secrets` port v1

The memory secrets shall be configured once, when they are created, and keep each secret under its name in upper case with `-` as `_`. When a configured name breaks the secret name rule, the constructor shall throw a `RangeError`.

## Examples

- Given `{ "serve-password": "hash" }`,
  when `SERVE_PASSWORD` is read,
  then it gives `hash`.
- Given `{ "bad name": "x" }`,
  when the secrets are created,
  then it throws a `RangeError`.
