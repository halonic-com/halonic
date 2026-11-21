# Decision: the runtime step counts the updater's lock (exit 8) as `runtime-busy`

- Task: HAL-15148
- Approval: Paperclip task HAL-15148 (split from Liam's security review of the updater's lock, HAL-15134); Liam reviews it and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ZCi7AHEoToQYvEyHj1VBh0y9Q10kixRAdEkDGnj09LMm/+2o9mxiCHI2+qn6gOcFRVYdlipXeWVWsX0ZwSf+Bw==

## What changes

`sandbox-srt.wsl-runtime` said the `installing-runtime` step fails with `runtime-busy` only on the updater's exit 3 (a sandbox session runs), and with `runtime-install-failed` on every other exit code. It now also fails with `runtime-busy` on exit 8, which the updater returns when another install, rollback or security update holds its lock (HAL-15134). The step stays saved, so the next run tries again. The requirement gains an example for it. Nothing else it says is removed or weakened: exit 0 and the exit-2 case still count as installed, and every other exit code, or an updater that didn't start, is still `runtime-install-failed`.

## Why

`runtime-install-failed` means the same archive won't do better and Studio needs reinstalling. A held lock only means another run is still busy, so the right answer is to try again later, which is what `runtime-busy` says. Studio doesn't show these codes yet, so no user sees the change.

## Covers

- sandbox-srt.wsl-runtime
