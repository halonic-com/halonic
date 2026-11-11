# Decision: `Sandbox` port version 6, reason codes for setup, WSL, policy and sign-in

- Approval: a port change needs Liam's review (ADR 2026-11-11-pluggable-sandbox-layer, "Port version 6"); Liam approves this note in review of the port v6 PR on [HAL-5389](/HAL/issues/HAL-5389)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Pfj0gknXa0MsIB3omplcxCuGsOhSl10oVoJmHz+CMmgZnkDvTyIqhRgS+RMd0a0ueXNh+Pkzn5koheHvEEH6Aw==
- Task: HAL-5389

## What changes

- The requirement `ports.sandbox-check-reason` lists nine more codes, in the order their fixes
  come: `not-supported`, `blocked-by-policy`, `virtualisation-off`, `wsl-missing`,
  `restart-needed`, `distro-missing`, `setup-conflict`, `setup-needed` and `sign-in-needed`.
  `windows` now means "this backend has no Windows mode". It gains an example for srt on Windows
  without its setup.
- The requirement `sandbox-srt.check` says `setup-needed`, not `windows`, for Windows without
  srt's one-time setup, because srt has a Windows mode.

## Why

The ADR moves Halonic to a list of backends (`srt`, `srt-wsl`, `mxc`, later `docker-sbx` and
`cloud`), each with failure causes the version 5 list can't name: WSL missing, a restart, a
company policy, a sign-in. The list is closed, so new codes are a breaking port change with
every adapter in the same change. `sign-in-needed` comes now so Docker Sandboxes and cloud
don't need a version 7.

The CLI has no approved words for the new codes yet. They read as `other` there, as the CLI's
messages already did for a code a later port adds, until the sandbox design words them. No test
was weakened: the CLI tests still check every worded code word for word, and a new test checks
that each new code reads as `other`.

## Covers

- ports.sandbox-check-reason
- sandbox-srt.check
