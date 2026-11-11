# workspace.trust-integration-code

- Status: active
- Since: 0.1.0
- Source: trust build plan item 3a on HAL-188 (HAL-2191), for HAL-983

The workspace package shall hash a local integration's code for the trust content as `sha256:` and the SHA-256 of the list of every file's path relative to the folder and the SHA-256 of its bytes, sorted by path, written as canonical JSON and preceded by its length. The hash shall not depend on the order the files are read in, and shall change when a byte of a file, a file's path, or the set of files changes. It shall refuse a path that is absolute or has a segment that is empty, holds `\`, `:` or a control character, or ends in `.` or a space (so `.`, `..` and a drive such as `C:` are refused too), and two files with the same path. `integration.yaml` is one of the files, so the hash covers the permission sheet as well.

## Examples

- Given `index.js` and `src/helper.js`, read in either order or one at a time,
  then the hash is the same.
- Given one byte of `index.js` changes, a file is renamed or moved, or an empty file is added or a file removed,
  then the hash changes.
- Given a file `ab` holding `c` and one `a` holding `bc`,
  then their hashes differ.
- Given a path `../outside.js`, `/etc/passwd`, `src\index.js`, `C:/index.js`, `src/a:b.js`, one with a NUL or a line break, or `index.js.`,
  then it is refused.
