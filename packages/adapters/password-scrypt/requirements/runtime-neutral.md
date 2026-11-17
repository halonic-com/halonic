# password-scrypt.runtime-neutral

- Status: active
- Since: unreleased
- Source: HAL-195 (phase 4); `ports.password-hash-format`

The scrypt hasher shall use only Web-standard APIs and `@noble/hashes`, and no Node APIs, so it runs wherever `host/server` does.

## Examples

- Given the package's source files,
  when they are scanned,
  then none imports `node:*`, or uses `Buffer` or `process`.
