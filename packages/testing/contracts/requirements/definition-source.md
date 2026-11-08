# contracts.definition-source

- Status: active
- Since: 0.1.0
- Source: HAL-114; plan 4.3 ("every port has a contract test suite"); `DefinitionSource` port v1

Every `DefinitionSource` adapter, read-only ones included, shall read a file's text or give `null` for a missing file, list file paths recursively, sorted and relative to the store root, give `[]` for a folder that doesn't exist, and keep its version the same while nothing changes. When a path is absolute, has a `.`, `..` or empty segment, or contains a backslash or NUL, the source shall reject with a `RangeError`.

## Examples

- Given a source holding `hubs/a/hub.yaml` and `hubs/ab/hub.yaml`,
  when it lists `hubs/a`,
  then it gives `["hubs/a/hub.yaml"]` and not the file under `hubs/ab`.
- Given any source,
  when it lists `hubs/missing`,
  then it gives `[]`.
- Given any source,
  when it reads `../outside.yaml`, `a/./b.yaml`, `/etc/passwd`, `a\b.yaml` or `""`,
  then the call rejects with a `RangeError`.
- Given a source that nothing changed,
  when its version is asked for twice,
  then both answers are the same non-empty string.
