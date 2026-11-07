# ports.web-types-only

- Status: active
- Since: 0.1.0
- Source: HAL-112 (multi-cloud ADR 9 rule 1; plan 4.4)

The ports package shall name only Web-standard and ECMAScript types, so every port can be implemented on Node, on Workers and in the browser. It shall import nothing but other core packages.

## Examples

- Given the `HttpClient` port,
  when an adapter implements it with a function that takes a URL and a `RequestInit` and returns a `Response`,
  then it compiles under the core preset.
- Given a port file that imports `node:stream` or names `Buffer`, `NodeJS.` or `process.`,
  when the tests run,
  then they fail and name the file.
