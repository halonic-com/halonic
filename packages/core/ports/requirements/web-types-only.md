# ports.web-types-only

- Status: active
- Since: 0.1.0
- Source: new in the core ports package: ports must work on Node, on Workers and in the browser

The ports package shall name only Web-standard and ECMAScript types, so every port can be implemented on Node, on Workers and in the browser. It shall import nothing but other core packages.

## Examples

- Given the `HttpClient` port,
  when an adapter implements it with a function that takes a URL and a `RequestInit` and returns a `Response`,
  then it compiles under the core preset.
- Given a port file that imports `node:stream` or names `Buffer`, `NodeJS.` or `process.`,
  when the tests run,
  then they fail and name the file.
- Given a port file with `/// <reference types="node" />`, a bare `import "node:fs"` or a type `import("node:stream").Readable`,
  when the tests run,
  then they fail and name the file.

The `HttpClient` example is proven by `tsc -p .`, which compiles the port files with the core preset. The type test under the Node test config only shows the signature is the Web `fetch` one.
