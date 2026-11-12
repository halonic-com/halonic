# password-pbkdf2.runtime-neutral

- Status: active
- Since: 0.1.0
- Source: HAL-6799; [HAL-136](/HAL/issues/HAL-136#document-decision): the deploy step on your machine and the Worker use the same code

The chained PBKDF2 hasher shall use only Web-standard APIs (Web Crypto) and no Node APIs, so it runs in Node and in workerd.

## Examples

- Given the package's source files,
  when they are scanned,
  then none imports `node:*`, or uses `Buffer` or `process`.
