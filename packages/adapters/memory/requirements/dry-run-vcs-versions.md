# memory.dry-run-vcs-versions

- Status: active
- Since: 0.1.0
- Source: HAL-3245; routing note task 1 (HAL-3236); HAL-1662

The dry-run Vcs shall read `snapshot`, `readAt` and `listAt` through to the repository it wraps, and shall record `rename` instead of making it, after refusing a path the `Vcs` port refuses and a rename in a folder that isn't a repository while no `init` is recorded.

## Examples

- Given a dry run of a repository with `a.yaml`,
  when `a.yaml` is renamed to `b.yaml`,
  then `changes()` reports the rename and the repository still has `a.yaml` and no `b.yaml`.
- Given a dry run, when a snapshot is taken, then `readAt` at it gives the files on disk.
