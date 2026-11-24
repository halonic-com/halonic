# toolscript-fence.no-ambient-globals

- Status: active
- Since: unreleased
- Source: ADR "Halonic ToolScript" (`docs/adr/2026-11-24-toolscript.md`, the T4 fence list in section 6), accepted by the board on HAL-10 on 24 Nov; task HAL-17569

Where an isolate implements `ToolScriptIsolate`, a script shall find none of `fetch`, `XMLHttpRequest`, `WebSocket`, `setTimeout`, `setInterval`, `process`, `require`, `importScripts`, `WebAssembly`, `SharedArrayBuffer`, `Atomics`, `Proxy`, `std`, `os`, `Deno` or `Bun` on `globalThis`.

## Examples

- Given any script,
  when it runs,
  then `typeof fetch` and `typeof process` are `"undefined"`.
