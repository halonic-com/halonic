# env-secrets.runtime-neutral

- Status: active
- Since: 0.1.0
- Source: HAL-2109

The environment secrets shall take the environment as a parameter and use no Node APIs, so they run in Node, in workerd and in tests without touching `process.env`.

## Examples

- Given the package's source files,
  when they are scanned,
  then none imports `node:*`, or uses `Buffer` or `process`.
