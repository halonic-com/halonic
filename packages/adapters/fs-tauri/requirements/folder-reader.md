# fs-tauri.folder-reader

- Status: draft
- Since: 0.1.0
- Source: HAL-8144 (T3 trust, HAL-1291); `ports.folder-reader` and `contracts.folder-reader`; `FileSystemFolderReader` in `fs-node`

The Tauri folder reader shall implement `FolderReader` and pass its contract suite by calling the shell's `folder_entries`, `folder_read` and `folder_location` commands, naming the folder only by the workspace the person opened, never by a path, and receiving a file's bytes as strict base64url. It shall refuse an unsafe path with a `RangeError` before it calls the shell. It shall only read: it shall call no command that writes or removes. When the shell refuses a path, because it goes through a link or the profile or is a special file, the call shall reject with a `RangeError`; a workspace that isn't open in the shell with a `denied` error; an unreadable folder or an `io` refusal with an `unavailable` error that keeps the shell's message. A rejection that isn't the shell's refusal shape, such as a page without the capability, or an answer that isn't the command's, shall reject with an `unavailable` error that doesn't repeat the shell's text.

## Examples

- Given a reader for `/workspaces/acme` and a file `.env` in it,
  when it lists and reads the folder,
  then `.env` is listed and read, as the CLI's reader gives it.
- Given a reader and `acme/latest`, a link,
  when `acme` is listed,
  then `acme/latest` is a `link`, and reading `acme/latest/x` rejects with a `RangeError`.
- Given a page without the capability for the folder commands,
  when it lists the folder,
  then it rejects with an `unavailable` error that doesn't hold the shell's text.
