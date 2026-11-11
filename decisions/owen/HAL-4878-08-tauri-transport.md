# Decision: Tauri's internals are read in one file, by two lookups

- Approval: [HAL-4878](/HAL/issues/HAL-4878)
- Kind: internal

`services.tauri-ipc` said that `tauriIpc` is the only code that reads
Tauri's internal `__TAURI_INTERNALS__`. Reading the shell's agent host
streams (HAL-4878 part 6) needs Tauri's callback table as well, which a
channel is made of. Rather than widen `TauriIpc`, which the secrets adapter
and the Android connect page take as just `invoke`, a second lookup,
`tauriChannelIpc`, sits next to `tauriIpc` in `tauri-ipc.ts`, and both go
through one private function.

The requirement now names the file as the one place that reads the object,
and both lookups. A lookup missing a function still throws an error naming
itself, now with the missing function too. The existing examples and tests
stay as they were; one example is added, with a test.

## Covers

- services.tauri-ipc
