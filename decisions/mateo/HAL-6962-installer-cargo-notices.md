# Decision: the Windows installer's THIRD-PARTY-NOTICES.txt lists the Rust crates too

- Task: HAL-6962 (follow-up of HAL-6289 and HAL-6225)
- Approval: Liam approved the plan to add the Rust crates to the installer's THIRD-PARTY-NOTICES.txt in [HAL-6293](/HAL/issues/HAL-6293); the maintainer (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:fvC6fm6RnspTrvdbQet3BWKVNweCw2d8PnT13rDGmblh0UgYCcAjY0/uzr5Ih9dlNUn8fCgPbi+P1Y7EfSkLDg==

## What changes

`studio.installer-third-party-notices` now says that the `THIRD-PARTY-NOTICES.txt` that
`windows/build-installer.ps1` writes lists the npm libraries and the Rust crates of `src-tauri`
for the installer's target. Its second example now says the script passes
`--cargo apps/studio/src-tauri` and `--cargo-target` set to the installer's target to
`pnpm check:sbom --notices`. The `Source:` line gains HAL-6962. No example was removed or
weakened: the first example is unchanged, and the second one asks for more than before.

## Why

The installer ships the Tauri binary, so the Rust crates compiled into it are bundled with the
app just like the npm libraries are, and their licences need their notices to reach the user.
#1968 (HAL-6289) added `--cargo` and `--cargo-target` to `check:sbom` and made CI run the exact
call the installer script now makes, with the same target (`x86_64-pc-windows-msvc`). With this
change the file the installer installs is the one CI already checks, and the requirement says so.

## Covers

- studio.installer-third-party-notices
