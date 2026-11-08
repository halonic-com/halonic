# testing-integration.source-scan

- Status: active
- Since: 0.1.0
- Source: HAL-135 (Ravi's input on HAL-99; plan 15.2 step I5 enforces the same at run time)

The source scan shall report each line of integration source that uses the global `fetch`, `globalThis`, `window` or `self`, `process`, `Deno` or `Bun`, `node:` modules or `require`, dynamic `import()`, `eval` or `Function`, or another network API, and shall allow `host.http.fetch`.

## Examples

- Given a line `const key = process.env["KEY"];`,
  when it is scanned,
  then the scan reports it with its file, line and rule.
- Given `await host.http.fetch(url)`,
  when it is scanned,
  then the scan reports nothing.
