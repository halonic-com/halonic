# Decision: MXC counts as a fence for the runner, local tools stay unfenced

- Approval: Julian's yes on HAL-9592, signed by the approver in review of the pull request
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:/+/mfYffN7S7HjoPjr8ijXZ2otgAY2ZNSiyCLg7tYJJEeLCbdphwqJsT7HhJd/LEQrQ/HwsvW9m/9OJ3TGEWAw==
- Task: HAL-9335

## What changes

- `mxcFencesRunner` is `true`: a runner started in an MXC box counts as fenced. The runner always
  starts with Node's `--permission` layer on top, which the A36 reasoning relies on.
- Local tools read a new constant, `mxcFencesLocalTools`, which stays `false`. MXC does not fence
  them yet, so nothing about them changes.
- `runner-start-gate.md` and the doc comment say attack cases A1 to A40 "passed or were recorded as
  a gap". The gaps are named: A36 (the box can list the user's Credential Manager entries once
  Node's layer is passed, and that layer is not a security boundary), A6 (through the Windows DNS
  client) and A24 (memory on Windows). MXC does not fully fence the runner.

## Why

The Windows 11 job "Sandbox fence (MXC on Windows 11)" passed 21 of 21 with no skips. Julian's review
accepted the flip on the condition that the open gaps stay written down. Follow-ups: HAL-9603,
HAL-9605 and HAL-9606.

## Covers

- app.plugin-local-tools
- app.runner-start-gate
