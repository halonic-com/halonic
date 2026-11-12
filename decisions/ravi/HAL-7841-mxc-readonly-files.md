# Decision: sandbox-mxc copies read-only files into the box folder

- Approval: HAL-7826 (CTO review of PR 2262 accepted the refusal as a stop-gap and asked for the copy as a follow-up); Liam approves this note in review on HAL-7850
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:/l1pSEP+xcIdGKSuZGSHkMdEtyas1CIzzWaLDeT3nb/cUaJjjAV5+DBLo2sngm5YYMtp2vGvlM6tLLOHiyjaAw==
- Task: HAL-7841

## What changes

- `sandbox-mxc.grant-paths` no longer says a read-only file is refused. It says a file is never
  granted and never widened to its folder; the new requirement `sandbox-mxc.read-only-files`
  says what happens instead.
- `sandbox-mxc.box-request` points to it for read-only files.

## Why

MXC grants folders only, and a profile can name single files (`runner-profile.ts`
`machine.systemFiles`, `harness-profiles.ts`). Refusing them meant MXC could not be used for those
profiles. Copying each file into its own folder under the session's box folder and granting that
folder read-only keeps the rule that the folder around a file is never granted. Files inside a
denied path are refused, so a copy never hands over what the profile hides.

Limit: the program reads the copy, not the original, so the host must pass the copy's path
(`MxcSession.readOnlyCopies`) to the program. That wiring is a host change, not this one.

## Covers

- sandbox-mxc.box-request
- sandbox-mxc.grant-paths
