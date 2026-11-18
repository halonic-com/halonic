# studio.src-tauri.crates.file-identity.file-identity

- Status: draft
- Since: unreleased
- Source: HAL-11253, HAL-6637

When the shell asks for the identity of a file or folder, it shall give the device and inode on Unix and the volume serial number and file index on Windows, following links, so that every name of one folder gives the same identity and a folder deleted and made again at the same path gives a new one. If nothing is at the path, or the system gives no identity, then it shall fail rather than give one.

## Examples

- Given a folder reached by its path and by a path through `..`,
  when their identities are read,
  then they are the same, and another folder's is different.
- Given a folder moved away and a new folder made at its path,
  when the identity is read again,
  then it differs from the one read before.
- Given a path with nothing there,
  when its identity is read,
  then the call fails.
