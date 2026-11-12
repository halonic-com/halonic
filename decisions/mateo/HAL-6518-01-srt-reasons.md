# Decision: sandbox-srt gives the right reason on WSL 1 and without bubblewrap

- Task: HAL-6518
- Approval: decided on [HAL-6513](/HAL/issues/HAL-6513); Liam approves this note in review on [HAL-6518](/HAL/issues/HAL-6518)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:SvNv9Ewzs+E3Xo5XOYnhA4xbvl3b0/IKMpIKCmeqa6QntbMPslfMf5aAsd0nzttfV/u8cnpGHCi6DUZ+kLPHAw==

## What changes

The active requirement `sandbox-srt.check` gets a sharper rule for which reason the adapter gives on Linux:

- Without bubblewrap, the reason is `bubblewrap-missing` only. The AppArmor setting isn't read then.
- With bubblewrap installed but unable to create a user namespace, the reason is `user-namespaces-restricted` only when `/proc/sys/kernel/apparmor_restrict_unprivileged_userns` exists and reads `1`. Otherwise it is `other`, with bubblewrap's own first stderr line as the sentence.
- WSL 1 is `not-supported`, with a sentence saying to switch the distro to WSL 2. The port already has this code (v6, HAL-5389), so the port doesn't change.
- `linux-tools-missing` names which helpers are missing: `socat`, ripgrep or both.

The requirement's list of reasons gains WSL 1 and `other`, and it gets three new examples (Ubuntu 24.04 without bubblewrap, bubblewrap failing with the setting off or missing, WSL 1). The `linux-tools-missing` example now says the sentence names the missing helpers. No example was removed or weakened.

## Why

On Ubuntu 24.04 the AppArmor setting is on by default, but bubblewrap's own AppArmor profile lets it through once it is installed. The adapter read the setting first, so a stock Ubuntu 24.04 user without bubblewrap was told to change AppArmor instead of to install bubblewrap. Blaming AppArmor whenever bubblewrap failed also hid every other cause, such as WSL 1, where bubblewrap can't run at all.

WSL 1 is detected from `/proc/version`: its kernel release ends in `-Microsoft` (`4.4.0-19041-Microsoft`). The test on the task ("Microsoft but no WSL2") would take WSL 2 kernels before 5.10 (`4.19.x-microsoft-standard`) for WSL 1. Fixtures cover WSL 1, WSL 2 before 5.10, current WSL 2 and Ubuntu.

The exported `Machine` interface replaces `userNamespacesRestricted` and `hasLinuxHelpers` with four probes (`isWsl1`, `missingLinuxHelpers`, `bubblewrapUserNamespaceError`, `appArmorRestrictsUserNamespaces`) and exports `LinuxHelper`. The only other user is the test fake in `apps/agent-host`.

## Tests

No test was skipped or weakened. `srt-sandbox.test.ts` covers each reason and the order between them. `machine.test.ts` adds the `/proc/version` fixtures and checks the AppArmor probe against the real setting on the runner. The programs test still starts only `bwrap`, `socat` and `rg` with fixed arguments.

## Covers

- sandbox-srt.check
