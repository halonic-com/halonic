# Decision: the Windows installer CI job checks the licence files it installs, and check:sbom runs on Windows

- Task: HAL-6225 (part 2 of HAL-6177)
- Approval: Elena asked for this check on [HAL-6225](/HAL/issues/HAL-6225); the maintainer (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:DTYqVxXTd5kIeJZTX6TVocfRolgWKYZcPxARscQt/2icuOccndGZAOMRtCQmentiuglC06PrUVmlRoZdEmdMDA==

## What changes

In `.github/workflows/ci.yml`, the `installer-windows` job's list of files that must be in the install folder gains `LICENSE`, `NOTICE` and `THIRD-PARTY-NOTICES.txt`. Nothing else in the workflow changes.

In `tooling/check/src/cli/sbom.ts`, `check:sbom` starts pnpm through the entry point pnpm names in `npm_execpath` (falling back to `pnpm`), instead of always `pnpm`. Nothing else in `tooling/check/` changes.

## Why

#1938 makes the installer install `LICENSE` and `NOTICE`, and this pull request makes `windows/build-installer.ps1` write `THIRD-PARTY-NOTICES.txt` and the installer install it. MPL-2.0 section 3.2(a) and the licences of the bundled libraries need these files to reach the user. The config test only reads `tauri.installer.conf.json`; the CI job is what proves the built installer really puts them next to the app. Elena took this change out of #1938 because a `.github/` change needs this note.

The installer build is the first place `check:sbom` runs on Windows. There `pnpm` is `pnpm.cmd`, which `execFileSync` can't start without a shell, so the first CI run failed with `spawnSync pnpm ENOENT`. The repo avoids shells for starting `.cmd` files; running pnpm's own entry point avoids both.

## Covers

- .github/
- tooling/check/
