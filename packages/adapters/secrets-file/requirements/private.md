# secrets-file.private

- Status: active
- Since: 0.1.0
- Source: HAL-195 (PR 9a-1b); design approved by Liam on HAL-8325

The file secret store shall make its folder readable only by the person (`0700`) and create the secrets file with mode `0600` when it opens it, never with a later `chmod`, so the file is never readable by others, not even for a moment. On Linux and macOS it shall refuse to read or change a secrets file that group or others can read, with a `denied` error that names the file and the fix, `chmod 600 <file>`, and never a value. It shall refuse a secrets file that is a symbolic link or has a second name (a hard link), so the secrets are never read from or written into a file elsewhere. On Windows the permission check is skipped, and the profile folder's own permissions protect the file; the README says so.

## Examples

- Given a new store, when a secret is set, then the folder has mode `0700` and the file `0600`.
- Given a secrets file with mode `0640`, then `get`, `names`, `set` and `remove` each refuse with the fix `chmod 600 <file>`, and `set` doesn't change the file.
- Given a secrets file that is a link to another file, then every call refuses it, and the other file is unchanged.
- Given a secrets file that is a hard link to another file, then every call refuses it.
