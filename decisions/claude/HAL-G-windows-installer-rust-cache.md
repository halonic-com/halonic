# Decision: the Windows installer and update jobs read a Rust release cache that only main saves

- Approval: pending (Liam for the workflow; Julian for the caching change), on HAL-18424
- Kind: internal
- Signature: pending

`installer-windows` and `update-windows` in `.github/workflows/ci.yml` restore a
`rust-installer-<os>-<hash of Cargo.lock and rust-toolchain.toml>` cache of the cargo
registry and `apps/studio/src-tauri/target`. Only `installer-windows` saves it, only when
`github.ref` is `refs/heads/main` (the hourly run), and only on a miss. Pull requests and
merge groups never write it. `release.yml` restores no cache, so a signed installer is
always built from scratch.

## Why

Both jobs built the Tauri release build cold on every pull request: about 8 minutes for
the installer and 7 for the update job's first build, out of 16.5 and 18.4 minutes (p50).

## Covers

- .github/
