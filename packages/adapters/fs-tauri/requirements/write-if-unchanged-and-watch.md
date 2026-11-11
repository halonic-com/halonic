# fs-tauri.write-if-unchanged-and-watch

- Status: draft
- Since: 0.1.0
- Source: routing note task 3 (HAL-3236), HAL-3247, HAL-3335, command shapes agreed on HAL-5753 and HAL-5761; `ports.definition-store-write-if-unchanged`, `ports.definition-store-watch`; `DefinitionStore` port v2

The Tauri definition store shall implement `DefinitionStore` and pass its contract suite by calling the shell's `fs_list`, `fs_read`, `fs_write` and `fs_remove` commands, naming the workspace it was made for in every call, and checking every path with the port's rules before it calls the shell. It shall send a write's `expected` to the shell, which compares it with the file and renames the new text into place under one lock, and shall never compare and write in two calls. When the shell refuses a path, which only it can see behind a link, the call shall reject with a `RangeError`; an unreadable folder with an `UnreadableWorkspaceFolderError` naming it; a workspace that isn't open with a `denied` error; a file that isn't UTF-8 text with an `invalid_input` error; an `io` refusal with an `unavailable` error that keeps the shell's message. A rejection that isn't the shell's refusal shape, or an answer that isn't the command's, shall reject with an `unavailable` error that doesn't repeat its text.

While a watch is open, the store shall hear the shell's `fs_watch` channel, read each path it names and report it as `ports.definition-store-watch` says, keeping the digest of every file it has seen so its own writes and removes are never reported. When the shell says the watch failed, or sends a message that isn't one, the store shall tell the listener's `failed` once and report nothing more, and `close()` shall stop the shell's watch with `fs_unwatch`.

## Examples

- Given a store for `/workspaces/acme` and `a.yaml` holding `1`,
  when `a.yaml` is written with the digest of `1`,
  then the shell receives one `fs_write` with the workspace, the path, the text and the digest, and the store gives `written`.
- Given `hubs` is a symbolic link,
  when `hubs/a/hub.yaml` is read,
  then it rejects with a `RangeError` and `list()` leaves it out.
- Given a watch,
  when Halonic writes `a.yaml` and another editor writes `c.yaml`,
  then the batch holds only `c.yaml changed`.
- Given the served Studio, which has no `desktop-files` capability,
  when any method is called,
  then it rejects with an `unavailable` error that doesn't hold the shell's text.
