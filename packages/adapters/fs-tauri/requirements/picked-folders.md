# fs-tauri.picked-folders

- Status: draft
- Since: 0.1.0
- Source: HAL-6637 (Liam's decision: the shell remembers picked folders across restarts), HAL-1291 (T3 part 4c)

The Tauri picked folders shall open a folder the person picked before by calling the shell's `reopen_folder` command, and forget one by calling `forget_folder`, each with the location as given, and shall never ask the shell to remember a folder. When the shell refuses a reopen because nothing is at the folder's path any more (`folder_missing`), it shall reject with a `not_found` error; when it refuses it as `not_picked` or `folder_changed`, so the folder has to be picked again first, with a `conflict` error; when it refuses it as `folder_unreadable`, with a `denied` error; and an `io` refusal with an `unavailable` error. A refusal's error shall keep the shell's message. A rejection that isn't the shell's refusal shape, such as a page without the `desktop-trust` capability, shall reject with an `unavailable` error that doesn't repeat its text.

## Examples

- Given the picked folder `/work/acme` and a restart,
  when it is reopened,
  then the shell receives `reopen_folder` with `{ location: "/work/acme" }`.
- Given the picked folder `/work/acme`, deleted since,
  when it is reopened,
  then it rejects with a `not_found` error.
- Given the served Studio, which has no `desktop-trust` capability,
  when a folder is forgotten,
  then it rejects with an `unavailable` error that doesn't hold the shell's text.
