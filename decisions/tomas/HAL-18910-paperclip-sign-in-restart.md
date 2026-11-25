# Decision: a workspace gets its Paperclip sign-in back when it opens

- Task: HAL-18910
- Approval: Liam approved the plan on HAL-18911 (25 Nov, 21:29 UTC), option (a); he reviews this PR and signs this note
- Kind: user-visible

## What changes

The board had to sign in to Paperclip again after every restart of Studio. The key was saved in
the OS keychain, but the agent host keeps keys in memory only, and `services.paperclip-connect`
said: "Nothing shall hand a key over when a workspace opens." So nothing gave the key back.

- `services.paperclip-connect`: that last sentence now says that when a workspace opens, the
  Studio services hand over only a key whose entry names that workspace and whose address and
  company match the connection file, pointing to the new requirement.
- `services.paperclip-restore` (new): the keychain entry lists the real paths of the workspaces
  the person signed in from; opening one of them hands the key back, quietly, only when the
  address and company match the file now. A clone, a changed file and an entry saved before this
  change get nothing. Disconnect deletes the whole entry.
- The agent host's `POST /v1/paperclip/connections` answer also carries the workspace's real path
  and each connection's company, so Studio compares paths the way the host resolves them and
  compares the company with the file.
- The ADR `docs/adr/2026-11-24-agent-messaging.md` gets a paragraph, *Restoring a sign-in on
  open*. The provider's address and company check before every call and the host's binding of a
  key to its workspace stay as they are.

## Tests

No test was weakened, skipped or deleted. Four tests compare a whole answer, so they now expect
the new fields as well:

- `packages/studio/services/src/host-agent-connections.test.ts`: the keychain entry a sign-in
  writes now also holds `workspaces: ["/work/acme"]`; the fake host lists with `listed()`.
- `packages/adapters/agent-host-client/src/paperclip-sign-in.test.ts`: the connections answer
  carries `workspace` and `company`, and `listed()` answers both.
- `apps/agent-host/src/messaging/desktop-connections.test.ts`: the row carries `company`; a new
  test lists the workspace through a link and gets its real path.
- `apps/agent-host/src/host.opened-workspaces.test.ts`: the connections answer for a folder the
  shell named now also holds its real path.

New tests: `paperclip-restore.test.ts` and `host-agent-connections-restore.test.ts` in
`packages/studio/services/src/`.

## Covers

- services.paperclip-connect
- packages/studio/services/src/host-agent-connections.test.ts
- packages/adapters/agent-host-client/src/paperclip-sign-in.test.ts
- apps/agent-host/src/messaging/desktop-connections.test.ts
- apps/agent-host/src/host.opened-workspaces.test.ts
