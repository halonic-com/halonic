# Decision: a Windows 11 fence job for MXC, and the SDK's dependency entry

- Approval: Liam's approval of part (c) of the on-demand download plan on HAL-7607 (the board's answer on HAL-7606); Liam signs this note in review of the PR
- Kind: internal
- Task: HAL-7607

## What changes

- `.github/workflows/ci.yml` gets a job, `Sandbox fence on Windows 11 (MXC)`, on
  `windows-11-arm`. It runs the `sandbox-mxc` fence tests, which fetch the SDK through the
  adapter's own hash-checked download. It runs when `sandbox-mxc`, `harness-bridge`, the ports,
  the format package, the workflow file or the lockfile change, and it is part of `ci-ok`.
- `tooling/check/dependencies.json` gets an entry for `@microsoft/mxc-sdk`, allowed only in
  `@halonicjs/adapter-sandbox-mxc`. It records that the SDK is a one-time download with pinned
  hashes, not a package dependency, which packages it brings and that telemetry stays off.

## Why

The ADR says every SDK bump must pass a real Windows 11 fence run, because the proxy-mode
loopback limit is observed, not documented. The same run proves the installer and the import
end to end. The entry keeps the approved exception written down where the dependency check
looks.

## Covers

- .github/
- tooling/check/
