# services.tauri-ipc

- Status: active
- Since: 0.1.0
- Source: HAL-2874, HAL-2639 (review of HAL-2611)

The Studio shall find the shell's IPC in one place, `tauri-ipc.ts`, which is the only code that reads Tauri's internal `__TAURI_INTERNALS__` object: `tauriIpc` for `invoke`, and `tauriChannelIpc` for `invoke` with the callback table a channel needs (HAL-4878). Each shall return nothing when the page has no such object, and shall throw an error naming the lookup and the missing function when the object is there without one of the functions it needs, rather than run as if outside the shell.

## Examples

- Given a page opened in a browser,
  when the Studio looks for the shell,
  then it finds none.
- Given a page in the shell,
  when the Studio calls a command through the IPC it found,
  then the shell receives that command and its arguments.
- Given a Tauri version whose `__TAURI_INTERNALS__` has no `invoke`,
  when the Studio looks for the shell,
  then it throws an error that names `tauriIpc`.
- Given a Tauri version whose `__TAURI_INTERNALS__` has no `unregisterCallback`,
  when the Studio looks for the shell's channels,
  then it throws an error that names `tauriChannelIpc` and `unregisterCallback`.
