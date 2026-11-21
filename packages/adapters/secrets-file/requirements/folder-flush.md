# secrets-file.folder-flush

- Status: active
- Since: unreleased
- Source: HAL-13881 (Julian's threat review of PR #4088 on HAL-13878); builds on `secrets-file.store`

Where Halonic runs on Linux or macOS, the file secret store shall flush the secrets file's folder to disk on every save, after it renames the new file into place and before the save reports success, so that a power cut right after the save can't bring back the old file. That matters most for the token key Halonic makes: without it, a token sealed with a new key could reach the disk while the key itself is lost. It flushes with `flushFolder` (`fs-node.flush-folder`), so nothing is flushed on Windows and a file system that can't flush a folder doesn't fail the save.

## Examples

- Given an empty profile,
  when `token-key` is stored if missing,
  then the `secrets` folder is flushed after `secrets.json` holds the key, and before the call answers.
