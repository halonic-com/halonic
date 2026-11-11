# memory.plugin-folder

- Status: active
- Since: 0.1.0
- Source: HAL-1736 (plugins P3) plan, step 3; `PluginFolderWriter` port v1

The memory plugins folder shall be a `PluginFolderWriter` with a `reader` that reads the same folder as a `FolderReader`, so a test can build the folder with the reader and see what `place` and `remove` did. It shall keep its own copy of the bytes it placed, and its location shall be its reader's.

## Examples

- Given a file placed from a byte array,
  when the test then changes that array,
  then the reader still gives the bytes that were placed.
- Given a memory plugins folder made at `memory:profile/plugins`,
  then its location is `memory:profile/plugins`.
