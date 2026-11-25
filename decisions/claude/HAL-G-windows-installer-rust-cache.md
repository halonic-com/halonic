# Decision: the Windows installer and update jobs read a Rust release cache that only main saves

- Approval: Liam (workflow) and Julian (cache OK on `b169a7fce`) on PR 6086, for HAL-18424
- Kind: internal

## What changes

`installer-windows` and `update-windows` in `.github/workflows/ci.yml` restore a
`rust-installer-<os>-<hash of Cargo.lock and rust-toolchain.toml>` cache of the cargo
registry and `apps/studio/src-tauri/target`. Only `installer-windows` saves it, only
when `github.ref` is `refs/heads/main` (the hourly run or a dispatch on `main`), and
only on a miss. The key is apart from `rust-tauri-*`, so the dev build's cache isn't
evicted. `docs/guides/checks.md` says so.

## Measured gain

Pull request runs on 25 Nov 2026, successful jobs, with no Rust cache:

- Windows installer: 16.5 min p50, 19.8 p90; building the installer is 8.1 min.
- Windows update: 18.4 min p50, 21.5 p90; the first build is 7.1 min, while the
  second and third, on a warm target folder, take 3.1 and 2.1 min.

Expected: each job's first build about 4 to 5 minutes shorter. Measured once a pull
request runs after `main` has saved the entry.

## Security

- Pull requests and merge groups only restore. `ci.yml` runs on `pull_request`, not
  `pull_request_target`, so a pull request's cache is scoped to its own ref and can't
  write `main`'s `rust-installer-*` entry.
- `release.yml` has no `actions/cache` step and its setups run with caching off, so a
  signed installer is always built from scratch and never reads this cache.
- Both jobs keep `contents: read`; no new permissions or secrets.

## Covers

- .github/
