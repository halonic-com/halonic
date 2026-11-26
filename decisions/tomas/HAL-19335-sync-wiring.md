# Decision: clearing a messaging source also deletes its local copy

- Approval: HAL-19201, the maintainer's approval of the sync service design with conditions (comment 805348ab), which asks for this note on PR 3; Liam signs it in his review of this pull request on HAL-19335
- Kind: internal

## What changes

The agent host now keeps a local copy of each Paperclip connection's agents, conversations, inbox
items and work (new requirement `agent-host.paperclip-sync`, package
`@halonicjs/host-paperclip-sync`). The copy sits in the workspace's messaging cache folder, under
`sync/`, in files only the user can read, and holds only the `AgentMessaging` port's fields, the
same boundary as the messaging cache.

`agent-host.agent-messaging-cache` gets one change: "Clearing a source shall delete everything
cached for it" now adds "the source's local copy (`agent-host.paperclip-sync`) included", with an
example. Disconnect clears the source, so its local copy goes with the cache, also a copy saved
before the host started, when no provider holds it. Nothing else in the requirement changes: the
cache still answers an offline source, writes still go straight to the source, and nothing is kept
to send later.

## Tests

No test was weakened, skipped or deleted. `paperclip-sync.test.ts` in `apps/agent-host` checks
that Disconnect deletes the local copy's files, also when a poll that was still reading Paperclip
ends after Disconnect (it fails without the fix that closes the held copy first). The desktop test
helper's fake Paperclip gets two opt-in switches, both off by default, so the existing tests see
the same answers as before: `servesInbox`, and `hold`, which holds one route's answer open.

## Covers

- agent-host.agent-messaging-cache
