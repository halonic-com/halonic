# Decision: MXC's SDK is downloaded on demand, and its loader may import the download

- Approval: Liam's plan and notes for the on-demand download on HAL-7607 (the board's answer on HAL-7606); Liam signs this note in review of the loader PR
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:aFmtYnCJpNaCoeGoabIi8ReLicFsJrcISy51zfIbdylvuXt9fmYP6QIP6xskODdFLrGqCO3sRFsv47jYc9gvAA==
- Task: HAL-7607

## What changes

- `app.sandbox-choice` and `app.doctor-mxc` gain the state `setup-needed`, the setup code
  `download` and the reason code `download-needed`. They show while MXC's SDK isn't downloaded
  yet, and only `downloadMxc()` downloads, when the person picks MXC. Start, a settings change
  and a `not-fenced` session never download. The sandbox port stays at version 3.
- `tooling/check/process-starters.json` gets one entry, for
  `packages/adapters/sandbox-mxc/src/sdk-setup.ts`. Its `import()` has a computed name, because
  a download can't have a fixed one. It imports one file only, inside the install folder for
  the exact pins, and only after the verified marker is there. `importSdk` refuses a folder
  under a skill's `scripts/` folder, as written or through a symbolic link, and the entry's
  `scriptsTest` shows that and that nothing is imported without the marker.
- `packages/adapters/sandbox-mxc` depends on our own `@halonicjs/format` for that refusal.

## Why

The SDK pulls in native code, so it isn't a package dependency. Every byte of it is checked
against a sha512 pinned in the repository before it is unpacked. The refusal of `scripts/`
folders is the same check every other adapter that starts a program uses.

## Covers

- app.sandbox-choice
- app.doctor-mxc
- tooling/check/
