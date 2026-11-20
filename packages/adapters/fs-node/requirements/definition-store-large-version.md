# fs-node.definition-store-large-version

- Status: active
- Since: unreleased
- Source: HAL-13291

When the files the folder definition store serves hold more text together than one string can, such as an agent's working folder with its installed packages, the store shall still give their version, the same one the memory store would give for the same files, reading one file and one piece of it at a time rather than all of them at once.

## Examples

- Given a root holding `workspace.yaml` and a `repo/` folder whose files hold 600 MiB together,
  when `version()` is called,
  then it gives the SHA-256 version of every file's path and text, without a `RangeError`.
- Given a root and a memory store holding the same files, one starting with a byte order mark, one with bytes that aren't UTF-8 and one with a character split across two pieces read,
  when both versions are asked for,
  then they are equal.
