# token-store.runtime-neutral

- Status: active
- Since: 0.1.0
- Source: HAL-620

The token store shall use only Web-standard APIs (Web Crypto, `TextEncoder`), and no Node APIs, so it runs in Node and in workerd.

## Examples

- Given the package's source files,
  when they are scanned,
  then none imports `node:*`, or uses `Buffer` or `process`.
