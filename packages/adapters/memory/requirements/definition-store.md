# adapter-memory.definition-store

- Status: active
- Since: 0.1.0
- Source: HAL-114; old `784f78d:packages/store/memory` `MemoryDefinitionStore`

The memory definition store shall start with the files it is given and say its location is `memory:workspace` unless told otherwise. Its version shall be `sha256:` and the first 16 hex characters of a hash over the sorted paths and their text, as in the old adapter, so it depends only on the files. `snapshot()` shall return a copy of every file. When a starting path is unsafe, the constructor shall throw a `RangeError`.

## Examples

- Given files `a.yaml` and `b.yaml`, passed in either order,
  when the version is asked for,
  then both stores give the same `sha256:` and 16 hex characters.
- Given a starting path `../x.yaml`,
  when the store is created,
  then it throws a `RangeError`.
- Given a store with `a.yaml`,
  when the caller adds a file to its snapshot,
  then the store still lists only `a.yaml`.
