# check.guard-dependency

- Status: active
- Since: 0.1.0
- Source: HAL-7719

If a pull request changes the entry for `@typescript/typescript6` in the `catalog` of `pnpm-workspace.yaml`, or the lines of `pnpm-lock.yaml` that resolve it for `tooling/check` (its importer entry, its package and snapshot entries, and those of its own dependencies), then the requirement guard shall report the file, and the note check shall pass it with a decision note of either kind that lists that file under Covers and whose signature verifies. Any other change to those two files is not reported.

## Examples

- Given a pull request that changes `@typescript/typescript6` from `^6.0.2` to `^6.1.0` in the catalog,
  when it adds no note,
  then the guard reports `pnpm-workspace.yaml` and the note check fails it.
- Given a pull request that only bumps `vitest` in the catalog and the lockfile,
  when it adds no note,
  then the guard and the note check report nothing.
- Given the same change to `@typescript/typescript6` with an `internal` note listing `pnpm-workspace.yaml`, signed by the CTO,
  when the note check runs,
  then it passes.
