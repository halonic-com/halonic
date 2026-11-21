# Decision: the Inbox's untrusted line only for the engine's untrusted refusal, by its code

- Task: HAL-14813
- Approval: asked for by Liam in his review of #4236 on HAL-14581; decided by the team on HAL-14813 (HAL-2282: it builds on the untrusted line the team decided on HAL-13973 and adds no new words)
- Kind: user-visible

## What changes

- `studio.untrusted-starts-nothing`: the engine's refusal of a workspace that isn't trusted is still `denied` with "This workspace isn't trusted yet, so nothing was started.", and now also carries the code `workspace.untrusted` (`WorkspaceUntrusted` in `@halonicjs/studio-shell`), as a stopped run carries `workspace.trust-removed`. Its test now also expects the code.
- `studio.remote-engine`: the background engine's 403 `workspace_not_trusted` becomes that same refusal, so the Inbox offers **Review** there too. Any other 403 stays a plain `denied`.
- `inbox.approval-card` and `inbox.wait-card`: the line "This workspace isn't trusted yet, so Studio can't send your answer." with **Review** shows only for that code. Any other `denied` (on the desktop, a folder that isn't open; on a phone, any 403 from the computer) shows "Couldn't record your decision." with the refusal's own sentence and **Try again**, as an `unavailable` failure already does. Each requirement gets an example for it.
- Tests: the existing untrusted tests in the Inbox (`approval-card-refusals`, `approval-card-changes`, `wait-card-refusals`, `workspace-trust`) now throw the engine's real refusal, `WorkspaceUntrusted`, instead of a bare `denied`. Each still asserts the same line and buttons; none is removed or weakened. New tests cover a `denied` that isn't about trust on both cards.

## Why

Before, the cards read every `denied` as the untrusted workspace. The Tauri stores map `folder_not_open` to `denied`, and `ServedInboxRuns` maps any 403 to `denied`, so in those cases the card pointed to **Review** when trust wasn't the problem. Matching on a code the engine sets is exact. On a phone, the served sentence ("The computer refused to send your answer. The workspace may not be trusted yet.") stays as the failure's own sentence, with no **Review**: a phone can't open the computer's trust check.

## Not in this change

The workflow start card (`workflows`) and the agents' Try it chat (`agents`) also read every `denied` as untrusted. A follow-up task moves them to `isUntrustedRefusal` once this lands.

## Covers

- studio.untrusted-starts-nothing
- studio.remote-engine
- inbox.approval-card
- inbox.wait-card
- packages/studio/features/inbox/src/ui/approval-card-refusals.test.tsx
- packages/studio/features/inbox/src/ui/approval-card-changes.test.tsx
- packages/studio/features/inbox/src/ui/wait-card-refusals.test.tsx
- packages/studio/features/inbox/src/ui/workspace-trust.test.tsx
- apps/studio/src/engine/engine-service-trust.test.ts
