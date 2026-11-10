# ports.folder-reader

- Status: active
- Since: 0.1.0
- Source: HAL-1735 plan, decision D1, approved by Liam on HAL-4038; the plugins ADR (`docs/adr/2026-11-09-plugins.md`), section 4: a plugin's fingerprint covers every file in its folder

The ports package shall have a read-only `FolderReader` port that lists every entry under a folder, with its kind (file, folder, link or other) and, for a file, its size; reads a file's bytes; and gives an entry's resolved real location. It shall have no method that writes, removes or follows a link.

The port's documentation shall state that, unlike `DefinitionSource`, it hides no name; that links and special files are listed but never followed or read; that paths are "/" separated and sorted by code-unit order on every system; that an unsafe path, or one through a link, is refused with a `RangeError`; and that a caller hashes the bytes `read` gave, never a second read.

## Examples

- Given the `FolderReader` port,
  when its members are read,
  then they are exactly `location`, `entries`, `read` and `locationOf`.
- Given `FolderReader.read`,
  then it returns `Uint8Array` or `null`, never text.
- Given a `FolderEntry` of kind `folder` with a `size`,
  when it is compiled,
  then it doesn't compile; a `file` without a `size` doesn't either.
