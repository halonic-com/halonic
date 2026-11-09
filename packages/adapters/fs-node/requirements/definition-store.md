# fs-node.definition-store

- Status: active
- Since: 0.1.0
- Source: HAL-1635; item 4 of the HAL-187 work plan

The folder definition store shall keep each workspace file as a plain file at its path under the root folder it is given, and say its location is that root unless told otherwise. Its version shall be worked out as the memory store's is, over the files it serves, so the same files give the same version in both. `list()` shall leave out a file name that a workspace path can't hold, such as one with a backslash, and give `[]` when the root doesn't exist. `read()` of a folder shall give `null`, and `remove()` of a folder shall change nothing.

## Examples

- Given an empty root,
  when `write("hubs/a/hub.yaml", "id: a\n")` is called,
  then the file `hubs/a/hub.yaml` under the root holds `id: a\n`.
- Given a root and a memory store holding the same files,
  when both versions are asked for,
  then they are equal.
- Given a root holding `a\b.yaml` and `a.yaml` on Linux,
  when `list()` is called,
  then it returns `["a.yaml"]`.
