# check.versions-agree

- Status: active
- Since: 0.1.0
- Source: HAL-1199

If the Studio app's version in `apps/studio/src-tauri/tauri.conf.json`, the `[workspace.package]` table of `apps/studio/src-tauri/Cargo.toml` or a crate of that Cargo workspace in `Cargo.lock` differs from the version in `apps/studio/package.json`, or a crate of that workspace sets its own version instead of `version.workspace = true`, then the `versions` check shall fail, name the file and line, and say to run `pnpm version:sync`.

## Examples

- Given all four files at `0.1.0`, then the check passes.
- Given package.json at `0.2.0` and tauri.conf.json at `0.1.0`,
  then the check fails on tauri.conf.json.
- Given a Cargo.lock whose workspace crate is at `0.0.9`,
  then the check fails on that line of Cargo.lock.
- Given a crates.io crate in Cargo.lock at another version, then the check passes.
- Given a crate whose Cargo.toml says `version = "0.1.0"`,
  then the check fails and says to use `version.workspace = true`.
- Given no tauri.conf.json and no Cargo.toml, then there is nothing to compare and the check passes.
- Given a Cargo.toml but no version in package.json,
  then the check fails on package.json.
