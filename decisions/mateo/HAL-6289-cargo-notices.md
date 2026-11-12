# Decision: CI builds the Rust crates' licence notices in the Tauri job

- Task: HAL-6289 (follow-up of HAL-6225)
- Approval: Liam asked for this check when he approved the plan in [HAL-6293](/HAL/issues/HAL-6293); the maintainer (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:VjX13o4On8iei8h78gXML/2ExE8JJ1lCt00iqgIg+SdDYCLaZ7abgU2ezUkdduLCbot8qMcc5RRSOenjwvvyDw==

## What changes

In `.github/workflows/ci.yml`:

- The `tauri` job gains one step after `cargo-deny`: `pnpm check:sbom … --notices --cargo apps/studio/src-tauri --cargo-target x86_64-pc-windows-msvc`, the command the Windows installer step of HAL-6225 (`build-installer.ps1`) will run, with the same `--cargo` and `--cargo-target` arguments. No release step on `main` runs it yet. Its output goes to the runner's temp folder and is thrown away.
- The `tauri` area also matches `tooling/check/licence-texts/crates/`, so a change to a crate's stored licence text runs that step.

Nothing else in the workflow changes.

In `tooling/check/` (a guard path since it is the guard's own code): `check:sbom --notices` learns `--cargo` and `--cargo-target`, reads the crates from `cargo metadata`, and writes their licence texts from `tooling/check/licence-texts/crates/` (or the crate's own licence file) into `THIRD-PARTY-NOTICES.txt`. The vendored files become their own section of the notices, under the same dedupe of identical licence texts. No guard rule changes.

## Why

`Halonic.exe` links about 280 Rust crates whose licences must ship with it. The release step fails when a crate has no licence text, its stored text is for another version, or its licence isn't allowed by `deny.toml`. Without this step a new crate would first fail at release time. With it, the pull request that changes `Cargo.lock` shows the problem.

## Covers

- .github/
- tooling/check/
