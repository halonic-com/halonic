# Decision: the SDK's dependency entry, and one-at-a-time fence test files

- Approval: Liam's approval of part (c) of the on-demand download plan on HAL-7607 (the board's answer on HAL-7606); Liam signs this note in review of the PR
- Kind: internal
- Task: HAL-7607

## What changes

- `tooling/check/dependencies.json` gets an entry for `@microsoft/mxc-sdk`, allowed only in
  `@halonicjs/adapter-sandbox-mxc`. It records that the SDK is a one-time download with pinned
  hashes, not a package dependency, which packages it brings and that telemetry stays off.
- The MXC fence config runs test files one at a time, because each file downloads the SDK into
  one shared folder.
- The ADR gets an amendment saying the SDK is downloaded on demand.

The Windows 11 fence job itself is not part of this change any more: it landed on `main` in
#2566 (HAL-3655), and this change keeps that job as it is.

## Why

The ADR says every SDK bump must pass a real Windows 11 fence run, because the proxy-mode
loopback limit is observed, not documented. The entry keeps the approved exception written
down where the dependency check looks.

## Covers

- tooling/check/
