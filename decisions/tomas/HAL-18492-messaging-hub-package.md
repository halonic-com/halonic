# Decision: the messaging hub, the key guard and the cache move out of the agent host

- Task: HAL-18492 (S1 of the server engine plan, HAL-17512 `server-engine` rev 2, section 7)
- Approval: Liam signs this note and approves the two new packages in review
- Kind: internal

## What changes

The server (`halonic serve`) needs the same messaging hub, Paperclip key guard and cache as the
desktop agent host, so they move out of `apps/agent-host` into packages both can import. The
files move unchanged (git sees each one as a rename with no edit, apart from import lines):

- `@halonicjs/host-agent-messaging-hub` (new, layer `host`): `MessagingHub` and its helpers
  (HAL-17493) and `PaperclipKeys`, the key guard (HAL-17495). They use only the `AgentMessaging`
  port and Web-standard APIs.
- `@halonicjs/adapter-agent-messaging-cache` (new, layer `adapters`, runtime `node`):
  `CachedAgentMessaging` and `MessagingCacheFolder` (HAL-17494). Its files use Node's file system,
  so it goes in an adapter, as the plan says, not in `host`.
- `privateFileAt`, which the cache and the remote host's stores both use, moves from
  `apps/agent-host/src/remote/` to `@halonicjs/adapter-fs-node`, next to the private-file helpers
  it is built from.

`apps/agent-host` imports all three from the packages. No behaviour changes. The requirements
stay in `apps/agent-host/requirements/`, unchanged: the agent host is still what they describe,
and the moved tests keep verifying them by ID.

## Why

The requirement guard counts a moved test file as deleted at its old path, and its tests as no
longer running there. The same tests run, unchanged, at the new paths.

## Tests

No test was weakened, skipped or edited. Moved, byte for byte:

- `messaging-hub.test.ts` and `paperclip-keys.test.ts` → `packages/host/agent-messaging-hub/src/`
  (31 tests pass)
- `cached-agent-messaging.test.ts` and `cached-agent-messaging-broken.test.ts` →
  `packages/adapters/agent-messaging-cache/src/` (23 tests pass)
- `private-file.test.ts` → `packages/adapters/fs-node/src/`

`apps/agent-host`'s messaging, Paperclip and remote tests pass (136 files, 1301 tests).

The guard sees two more differences, both from the move alone:

- `agent-host.paperclip-key-hand-over` makes one `expect` call fewer (80, not 81). The test "keeps
  the key in memory only" in `paperclip-key-routes.test.ts` makes one call for each source file in
  `apps/agent-host/src/paperclip/`, and `paperclip-keys.ts` is no longer there. The moved file is
  held to more now: in a `host` package, the linter refuses every `node:` import, not only
  `node:fs` and `node:child`.
- `private-file.test.ts` carries its two `skipIf(process.platform === "win32")` tests (file modes
  mean nothing on Windows) to its new path, where the guard counts them as new.

## Covers

- agent-host.messaging-hub
- agent-host.messaging-hub-attachments
- agent-host.paperclip-key-hand-over
- agent-host.agent-messaging-cache
- agent-host.remote-paired-phones
- ports.agent-messaging-avatars
- apps/agent-host/src/messaging/messaging-hub.test.ts
- apps/agent-host/src/paperclip/paperclip-keys.test.ts
- apps/agent-host/src/messaging/cached-agent-messaging.test.ts
- apps/agent-host/src/messaging/cached-agent-messaging-broken.test.ts
- apps/agent-host/src/remote/private-file.test.ts
- packages/adapters/fs-node/src/private-file.test.ts
