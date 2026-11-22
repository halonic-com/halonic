# Decision: the Windows installer job tests a standard user's reinstall after a removal as administrator

- Task: HAL-16084 (from the findings on HAL-16082)
- Approval: the task asks for this test; Liam approves this note in his review of this pull request on HAL-16084
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:cUMZSbhIAOYHWQCph1iTs4GXJKIsFvvbR6X+1NgEdVdZRbSfBNp48yP7YlpkyYyKgVdnU76qC4r9fqNVgqb5Bw==

## What changes

In `.github/workflows/ci.yml`, the Windows installer job gets one more step after the uninstall
step: `apps/studio/src-tauri/windows/test-take-back.ps1`. It creates a standard local user, has that
user install Halonic, sets the sandbox up and gives the user a kept access grant, removes the sandbox
as administrator, has the user install again with `/S`, and checks that `srt-win user status` says
`none` and the folder's access entry is gone. It removes the user and the sandbox before it ends.

Triggers, rights, runners, secrets, permissions and the other steps don't change.

## Why

A removal as administrator keeps srt's access grants on the user's folders. Halonic takes them back
only while srt's sandbox account is gone, and the installer's sandbox step creates that account again
before Halonic first starts. This pull request has the installer run `--sandbox-take-back` as the
installing user first. Only a real Windows install by a standard user shows that this works, so the
test has to run in the installer job.

## Tests

No test was weakened or skipped. The new step runs last because it starts without a sandbox and
leaves none behind, so the existing install and uninstall steps run exactly as before.

## Covers

- .github/
