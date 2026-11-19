# fs-node.flush-folder

- Status: active
- Since: unreleased
- Source: HAL-13881 (Julian's threat review of PR #4088 on HAL-13878)

The `flushFolder` function shall flush a folder's own entry list to disk on Linux and macOS, so a file renamed into it keeps its new name after a power cut. On Windows it shall do nothing and open nothing, because a folder can't be opened to flush there and NTFS logs a rename itself. A file system that refuses to flush a folder (`EINVAL`, `ENOTSUP` or `EISDIR`) shall not be an error; any other error shall be thrown.

## Examples

- Given a folder on Linux,
  when it is flushed,
  then its handle is flushed once.
- Given Windows,
  when a folder that isn't there is flushed,
  then nothing is opened and there is no error.
- Given a file system that answers `EINVAL` to a folder flush,
  when the folder is flushed,
  then there is no error; and when it answers `EIO`, the flush fails with it.
