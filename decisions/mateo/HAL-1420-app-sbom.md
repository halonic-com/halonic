# Decision: the release writes the app SBOM and the full third-party notices

- Task: HAL-1420 (follow-up of HAL-1200)
- Approval: the task [HAL-1420](/HAL/issues/HAL-1420) asks for this change; the maintainer (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:OxrnAdJt3Mf/mN9gc40l8Poa61mzhAFcMq1nWBX6jUq1lYp8/ozh4kByQnZ6xWiDrxSQrjyYLKSqZkNj0H7JDQ==

## What changes

In `.github/workflows/release.yml`, the build job:

- installs the Rust toolchain pinned in `apps/studio/src-tauri/rust-toolchain.toml`, for `cargo metadata`;
- writes the CLI SBOM without notices, then `halonic-studio-<v>.cdx.json` with `pnpm check:sbom --name halonic-studio … --notices --cargo apps/studio/src-tauri --cargo-target x86_64-pc-windows-msvc`. Both are in `dist/`, so `SHA256SUMS` lists them. `THIRD-PARTY-NOTICES.txt` now also lists the Rust crates the app links.

Nothing else in the workflow changes. It still makes dry runs only.

In `tooling/check/` (the guard's own code): `check:sbom` also fails when a ref in the SBOM's dependency graph names neither a component nor the product (`findDanglingRefs`). No guard rule changes.

The installer's own notices get the same `--cargo` arguments in #2110 (HAL-6962), not here.

## Why

The app is released next to the CLI and needs its own SBOM. Before this change, the release's notices listed the npm packages but not the 282 Rust crates in `Halonic.exe`. The dangling-ref check makes the "no dangling refs" condition of HAL-1420 checked on every release instead of by hand.

## Covers

- .github/
- tooling/check/
