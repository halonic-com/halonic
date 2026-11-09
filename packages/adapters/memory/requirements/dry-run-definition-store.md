# memory.dry-run-definition-store

- Status: active
- Since: 0.1.0
- Source: HAL-1662; point 3 of the Docker research (HAL-1600), approved on HAL-1649; Compose's `pkg/dryrun`

The dry-run definition store shall read through to the store it wraps and shall never write to it or remove from it. When asked to write or remove a file, it shall keep the change in memory, show it to later reads and listings, and record it, so `changes()` returns every write and remove in the order asked. It shall refuse a write or remove of a path the wrapped store refuses to read, such as one through a link, and record nothing for it. While no change is pending, its location and version shall be those of the store it wraps; once one is, its version shall be `dry-run:` and 16 hex characters of a hash over the wrapped version and the pending changes. It shall pass the `DefinitionStore` contract suite.

## Examples

- Given a dry run over a store holding `a.yaml` and `b.yaml`,
  when the caller writes `c.yaml` and removes `b.yaml`,
  then the dry run lists `a.yaml` and `c.yaml`, the wrapped store still holds `a.yaml` and `b.yaml`, and `changes()` reports the write and then the removal.
- Given a dry run with no pending change,
  when the version is asked for,
  then it is the wrapped store's version.
