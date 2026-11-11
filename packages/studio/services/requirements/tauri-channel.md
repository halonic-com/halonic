# services.tauri-channel

- Status: active
- Since: 0.1.0
- Source: HAL-4878 (part 6), Tauri 2.12's `Channel` in `@tauri-apps/api`

The Studio shall read a shell channel the way Tauri 2.12's `Channel` does, without that library: it shall register a callback, pass `__CHANNEL__:<id>` as the command's argument, and hand on the shell's `{ message, index }` messages in index order, holding a message until the ones before it have come. It shall remove the callback once the shell's `{ end: true, index }` marker and every message before it have come, or when the Studio closes the channel, and drop anything the shell sends after that.

## Examples

- Given a channel whose messages 1 and 0 arrive in that order,
  when they come,
  then the Studio reads message 0, then message 1.
- Given the shell's end marker arriving before its last message,
  when that message comes,
  then the Studio reads it and then removes the callback.
- Given a channel the Studio closed,
  when the shell sends another message,
  then nothing reads it.
