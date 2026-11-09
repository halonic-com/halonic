# check.app-version-sync

- Status: active
- Since: 0.1.0
- Source: HAL-1199

When `pnpm version:sync` runs, it shall copy the version in `apps/studio/package.json` into the top-level `version` of `apps/studio/src-tauri/tauri.conf.json`, the `[workspace.package]` version of `apps/studio/src-tauri/Cargo.toml` and every crate of that Cargo workspace in `Cargo.lock`, change nothing else in those files, and leave out the ones that don't exist yet. If the package.json version is missing or not semver, then it shall change no file and fail.

## Examples

- Given package.json at `0.2.0` and the other three files at `0.1.0`,
  when the sync runs,
  then all three say `0.2.0` and every other line is unchanged.
- Given a Cargo.lock with a crates.io crate at `1.0.0`,
  when the sync runs,
  then that crate stays at `1.0.0`.
- Given no tauri.conf.json,
  when the sync runs,
  then it updates Cargo.toml and Cargo.lock and creates no Tauri config.
- Given a `[workspace.package]` table with no version,
  when the sync runs,
  then it adds the version to that table.
- Given package.json with no version, or with `v0.2.0`,
  when the sync runs,
  then it fails and writes nothing.
- Given every file already at the package.json version,
  when the sync runs,
  then it changes nothing.
