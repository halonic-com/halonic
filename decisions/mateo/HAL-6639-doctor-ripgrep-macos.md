# Decision: the sandbox check asks for ripgrep on macOS too, with its own reason code

- Task: HAL-6639
- Approval: decided for 0.1.0 on [HAL-6606](/HAL/issues/HAL-6606) (item 2); Liam approves this note in review on [HAL-6639](/HAL/issues/HAL-6639)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:O+j2TUn4GOQ3tN8ti5PWCJgh00LTD5dde6rG5/Pw2a7LSp6BGoVhk2d4+laoy6i1MhEfat+lL2hH65AwFguABA==

## What changes

srt starts ripgrep (`rg`) next to Seatbelt on macOS, as it does next to bubblewrap on Linux, but `check()` asked for it only on Linux. On a Mac without ripgrep, `halonic doctor` showed a green Sandbox line and the first sandboxed run failed with `spawn rg ENOENT`.

The `Sandbox` port's closed list gains `ripgrep-missing`, after `linux-tools-missing`. sandbox-srt's check gives it on macOS when Seatbelt is there and `rg --version` doesn't start (asked once, like the Linux helpers). `doctor`'s Sandbox line is then ✕ with that code, and the CLI words it "ripgrep isn't installed, and the sandbox needs it." with the fix `brew install ripgrep`. The requirements gain one example each, and the port's requirement names the new code.

CI's Seatbelt fence job installs ripgrep with Homebrew before its tests, because the macos-15 runner image doesn't ship it and the check now refuses to start without it.

## Why

`linux-tools-missing` names `socat` and an `apt` fix, both wrong on a Mac. A code of its own lets the CLI and Studio give the one fix that works there. The words build on the doctor screen the board approved, so the team decides them (board, HAL-2282).

## Covers

- sandbox-srt.check
- app.doctor-sandbox
- ports.sandbox-check-reason
- .github/
