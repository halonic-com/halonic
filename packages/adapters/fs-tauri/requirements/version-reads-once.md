# fs-tauri.version-reads-once

- Status: draft
- Since: unreleased
- Source: HAL-19531 step 3 (HAL-19964), plan approved by Liam on 26 Nov; `fs-tauri.write-if-unchanged-and-watch`

The Tauri definition store's `version()` shall give the same value as before for the same files: `sha256:` and the first 16 hex characters of a hash over every listed file's path and text, as `fs-node` and the memory adapter work it out. It shall keep the text it read for 2 seconds, and the next `read()` of each of those files in that time shall take its text from there, once, without asking the shell, so a load that asks for the version and then reads the same files reads each file over IPC once. A write or remove of a file through the store, and a change of a file its watch hears of, shall drop that file's kept text. After 2 seconds, every read shall ask the shell.

## Examples

- Given the acme example's files,
  when the version is worked out,
  then it is the same as when each file is read one at a time and hashed as before.
- Given the acme example's files,
  when a load asks for the version and then reads every listed file,
  then the shell is asked to read each file once.
- Given `a.yaml` holding `1` and a version just worked out,
  when another program writes `2` into it and the store reads it twice,
  then the first read gives `1` and the second `2`.
- Given a version worked out 3 seconds ago,
  when a file is read,
  then the store asks the shell.
