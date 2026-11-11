# app.integration-folder

- Status: active
- Since: 0.1.0
- Source: HAL-983; trust build plan item 3a on HAL-188 (a hash of every file, symbolic links refused); I5 design on HAL-958, section 5 and attack case A12; the limits of `app.plugin-folder` (2,000 files and folders, 50 MB)

The app shall read a local integration's folder in a workspace through the `FolderReader` port: list it, refuse it on the listing alone when it holds a link or a special file anywhere, more than 2,000 files and folders, or more than 50 MB of files, before reading any byte, then read every file, hash it with `integrationCodeDigest` by its path in the folder, and parse `integration.yaml` from the bytes it hashed. A file that grows past the byte limit or disappears while it is read shall stop the read with a problem. A folder without `integration.yaml`, or without any entry, shall be refused.

## Examples

- Given `integrations/radar` with `integration.yaml` and `src/index.js`,
  then the result is the parsed sheet and the hash of both files by their paths in the folder.
- Given one byte of `src/index.js` changed,
  then the hash differs.
- Given a link at `integrations/radar/src/keys`,
  then the folder is refused with `link` for `src/keys`, and no file is read.
- Given a folder without `integration.yaml`,
  then it is refused with `sheet-missing`.
