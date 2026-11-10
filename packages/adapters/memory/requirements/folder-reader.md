# memory.folder-reader

- Status: active
- Since: 0.1.0
- Source: HAL-1735 plan, decision D1, approved by Liam on HAL-4038; `FolderReader` port v1

The memory `FolderReader` shall let a test build its folder with files, empty folders, links and special files, and change it while a caller reads it. It shall keep its own copy of the bytes a test puts. `remove` shall delete an entry and everything under it. Putting an entry under a file or a link shall throw and change nothing.

## Examples

- Given a file put from a byte array,
  when the test then changes that array,
  then `read` still gives the bytes that were put.
- Given a folder `acme` with `plugin.yaml` in it,
  when `acme` is removed,
  then `entries` no longer lists either, and `read("acme/plugin.yaml")` gives `null`.
- Given a link `acme/latest`,
  when a file `acme/latest/x` is put,
  then it throws, saying `acme/latest` isn't a folder.
