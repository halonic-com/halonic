# Decision: test the sandbox helper's publisher check on the Windows runner

- Task: HAL-7414 (S1 follow-ups from Julian's security review on HAL-7385, S-4 and S-5)
- Approval: the task asks for this change; Liam approves this note in review on [HAL-7414](/HAL/issues/HAL-7414)
- Kind: internal

## What changes

The `tauri-windows` job in `.github/workflows/ci.yml` gets one new step and a longer helper step:

- **Sandbox helper's signature check** (new): reads PowerShell's own signed program (`pwsh.exe`) and its publisher with `Get-AuthenticodeSignature`, then runs the crate's ignored Windows test, which must read the same publisher through `WinVerifyTrust` and find none on a copy with one byte changed.
- **Sandbox helper** (longer): after `remove`, it builds the helper again with `HALONIC_SANDBOX_SIGNER` set, as the release will, and runs `setup`. That build isn't signed, as a swapped helper wouldn't be, so its copy must be refused with exit 35, deleted, with no Installed apps entry and without running srt-win.

Same triggers, same read-only rights, no secrets, publishes nothing.

## Why

The helper's copy of itself, which Installed apps runs elevated, must show the publisher Windows asked about (S-4). Whether `WinVerifyTrust` and the certificate name are read right can only be proven on Windows; the crate's own tests cover the steps against a pretend Windows.

## Covers

- .github/
