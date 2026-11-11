# check.guard-own-paths

- Status: active
- Since: 0.1.0
- Source: HAL-131

If a pull request changes, adds or deletes a file under one of the guard's own paths, that is `.github/`, `packages/testing/parity/allowed-differences.json`, `packages/testing/spec/`, `tooling/check/`, `tooling/config/src/vitest-preset.ts` or `turbo.json`, then the requirement guard shall report it under that guarded path. A change to `tooling/check/policy.json` in its `extraExports` entry only is reported under `check.guard-extra-exports` instead.

## Examples

- Given `.github/workflows/ci.yml` on the merge base,
  when the pull request changes one line of it,
  then the guard reports the file, and the note must list `.github/`.
- Given `tooling/config/biome.jsonc` on the merge base,
  when the pull request changes it,
  then the guard reports nothing.
