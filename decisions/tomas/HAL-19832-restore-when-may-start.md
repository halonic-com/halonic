# Decision: a workspace that may start a run gets its Paperclip sign-in back when it opens

- Task: HAL-19832
- Approval: Liam approved the plan on HAL-19832 (26 Nov), with conditions; he reviews this PR and signs this note
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:OQCiFzkp8tzC6LVEbp44eALQd9+LUmetz8RiNdYpAt2bZfs1KkRaUq8xOwTI5UYmgqk5HC7ZCpQSjt3n9AV1BA==

## What changes

The board still had to sign in to Paperclip after every restart, on a build with the restore
(HAL-18910, HAL-19027). The restore ran only once the person had trusted the workspace
(`WorkspaceTrust.isTrusted()`). A workspace that reaches only the test model, such as the demo or
a folder used only as a Paperclip client, never asks for trust, so it was never "trusted" and the
restore never started. The Windows click test shows it: preview run 287, the demo is connected in
step 3, and after the app restarts Messenger says "No connections".

- `services.paperclip-restore`: the restore now waits for the rule runs start by
  (`studio.untrusted-starts-nothing`, `WorkspaceTrust.mayStartNow()`): the person trusted the
  workspace, or it reaches only the test model. Until the trust check has ended, and after one
  that failed, the answer is still no and the agent host is asked nothing. A workspace with a
  connector, an agent program, a local integration or a real model still restores nothing until
  the person trusts it. The entry's workspace, address and company checks are unchanged.
- One example is added (the demo, with its connection file), and the example for a workspace the
  person hasn't trusted now says it has a connector, since only then does it need trust.
- The connection file Connect writes (`connections/paperclip/<name>.yaml`) isn't part of the
  trust content, so a connected demo still needs no trust. A test proves it.
- The restore stays one-shot. If someone adds a connector to the workspace after the restore,
  the key the agent host already holds stays there until the app quits, the same as after the
  person removes trust today. This is on purpose, not a gap: the key was the person's own sign-in
  in this workspace, and every call is still checked against the connection file's address and
  company.
- In `@halonicjs/studio-services`, `restoreWhenTrusted` is renamed `restoreWhenMayStart`, and
  `RestoreTrust` asks `mayStartNow()` instead of `isTrusted()`. No alias is kept.
- The ADR `docs/adr/2026-11-24-agent-messaging.md`, *Restoring a sign-in on open*, says the same.

## Tests

No test was weakened, skipped or deleted.

- `packages/studio/services/src/paperclip-restore.test.ts`: the `restoreWhenTrusted` tests follow
  the rename; their fake trust answers `mayStartNow()` instead of `isTrusted()`, and two test
  names say "may start" instead of "trusted". What they check is unchanged. A new test checks
  that the restore runs only once when a later check says no and then yes again.
- `apps/studio/src/studio/desktop-connections.test.ts`: its fake trust answers `mayStartNow()`;
  what it checks is unchanged.
- New: `apps/studio/src/inbox/provide-agent-connections.test.ts`, with a real trust check on a
  folder that holds only the test model and a Paperclip connection file. It asks the agent host
  for the restore at open and keeps `needsNoTrust` true (fails before the fix); a check that is
  still running or failed asks the host nothing.

## Covers

- services.paperclip-restore
- packages/studio/services/src/paperclip-restore.test.ts
- apps/studio/src/studio/desktop-connections.test.ts
