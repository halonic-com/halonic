# Studio reads Paperclip live through a connection with a fixed list of calls

- **Status:** Proposed
- **Date:** 2026-11-24

## Context

The board wants Studio to answer its Paperclip cards in Halonic Inbox and to
chat with Paperclip's agents in a new Messenger, first on the desktop
(HAL-17422; the board approved the plan on HAL-10). Paperclip is a separate
system with its own API and sign-in. Halonic doesn't run its agents, and its
tasks, comments and cards are private company data.

We looked at three ways to hold that data:

1. **Clone it into the workspace** and keep the copy in sync. Workspaces are
   plain files in git, so private data could end up in a commit or on GitHub,
   and we would have to resolve conflicts that Paperclip already resolves.
2. **Treat Paperclip as a Remote Hub.** A hub is a folder that Halonic runs, and
   Remote speaks Halonic's own protocol. Paperclip's items are neither files
   nor run here, so calling them a hub would suggest they can be edited or run.
3. **Read it live through a connection of its own**, with a cache outside every
   workspace. This is what we chose.

## Decision

**A connection is its own concept.** Each Paperclip instance a workspace uses
is one file, `connections/paperclip/<name>.yaml`, holding a label, the server's
address and the company. It holds no key and no data
(`ports.paperclip-connection`). Studio shows a connection like a read-only hub,
for example "Paperclip · Halonic". Its agents, projects and tasks are proxy
items: they are read-only and run nothing locally. Importing them as a real hub
would be a separate decision.

**Paperclip stays the only source of truth.** Studio reads it live. A small
cache sits in the app data folder, outside every workspace, keyed by server
address and company. Disconnecting deletes the cache, and nothing from
Paperclip is ever written into a workspace.

**One port with a fixed list of calls.** Studio reaches Paperclip only through
`PaperclipSource` in `core/ports` (`ports.paperclip-source`). Its calls are
the whole list: list agents, projects and tasks; read a task's comments; read
cards; answer a card; comment on a chat task. Studio has no other call to
Paperclip, even though the board's key could make one, so nothing can hire,
change budgets or settings, or delete. A new call needs a new port version and
a security review. Outside the port, only the host's sign-in and disconnect
make calls, and only to the sign-in routes: start, poll and cancel a challenge,
read `/api/cli-auth/me`, and revoke the current key. Inbox and Messenger build
against `FakePaperclipSource`
(`contracts.fake-paperclip-source`) until the client lands.

**The key** (`ports.paperclip-key`). We accept for now that a board key
carries all of the board's powers. The key lives in the OS keychain, one entry
per connection, and the agent host holds it in memory only, the way Studio
already hands a plugin its secrets (ADR of 19 Nov). The Studio page never sees
it, and no file, log line or answer holds it. The host uses a connection's key
only at that connection's address and refuses a redirect to another host.
Disconnecting revokes the key in Paperclip and deletes its keychain entry.
We ask Paperclip upstream for keys limited to these calls, with an expiry we
choose, a list of devices the board can revoke, and no power to make more keys.

**Several instances.** An item's ID is its connection, its company and its
Paperclip ID, because task keys such as `HAL-10` repeat across instances.
Every item shows its connection's name. An answer or a message always goes back
through the source of the connection the item came from.

**Offline** (`ports.paperclip-offline`). Studio shows the cache with an
"Offline, as of 14:02" banner. Answer buttons are off, and a typed message
stays a draft. Nothing is queued and sent later, because an approval sent
hours late can be wrong by then. When two clients answer the same card,
Paperclip decides: the second answer gets "already answered", and Studio shows
who answered and how.

**Polling** (`ports.paperclip-polling`). About every 30 seconds while the
window is in front, every few minutes in the background, and at once when the
window comes back to the front. Timers go through the `Scheduler` port. Live
updates come later, once we know what Paperclip offers outside clients.

**Where the code goes.** The port is in `core/ports` and the fake in
`testing/contracts`. The HTTP client goes in a new `adapters/paperclip-client`
package, which needs the maintainer's approval. It uses plain `fetch` and no
new dependency. The host side (keychain hand-over, polling, cache) is in the
desktop agent host. Studio features reach the connection only through
`studio/services`. Inbox gets a Paperclip source (`inbox.paperclip-cards`).
Messenger becomes a new feature (`studio.messenger`).

**Sign-in.** Studio uses Paperclip's CLI sign-in route, tested against our
server on HAL-17423 (only the board's own Approve click is still to be tried
live):

1. Studio starts a challenge (`POST /api/cli-auth/challenges`) at the address
   the board uses for Paperclip's page, which must be on Paperclip's hostname
   allow-list. The answer already holds the key, which only works once the
   board approves. The host keeps it in memory and drops it if the challenge
   is cancelled or expires.
2. Studio opens the approval page in the browser and shows a short random
   phrase that it also put in the challenge's `command` text, so the board
   approves only the request Studio just opened. Studio tells the board to
   approve nothing else. It shows the 10 minutes the challenge lasts and
   cancels the challenge (`/cancel`) when the dialog closes.
3. Once a poll says `approved`, the host moves the key to the keychain and
   reads `/api/cli-auth/me` to check that the key's user belongs to the
   connection's company.

The key expires after 30 days, a fixed value on this route. An expired or
revoked key gets a 401, and Studio then asks the board to sign in again.
Disconnecting calls `POST /api/cli-auth/revoke-current`. If that fails because
Paperclip can't be reached, Studio says the key stays valid until its expiry
and can be revoked in Paperclip.

**A board key can make more board keys** (`POST /api/board-api-keys`), and
those keys can be set to never expire. Disconnect doesn't revoke them. The
client therefore never calls a route that makes, lists or deletes keys. The
fixed call list already rules that out, and the client's tests check it. We
add "a board key can't make keys" to the upstream request.

## Threat model

| Threat | Mitigation |
| --- | --- |
| A stolen key acts as the board in Paperclip | The key is only in the keychain and the host's memory, never in a file, log or the page. Disconnecting revokes it. We ask Paperclip for limited, expiring keys. Until then, a full-power key is a risk the board accepted |
| Studio, or code in the page, makes a call beyond reading, answering and commenting | The port has no other call. The client only implements the fixed list, and a new call needs a new port version and a security review |
| A stolen key makes a second key that never expires | The client never calls a key-making route, which its tests check. Upstream request: a board key can't make keys. Until then the board can list and delete keys in Paperclip |
| Someone sends the board an approval link for their own sign-in | Studio shows a random phrase that the approval page also shows, and tells the board to approve only that one. A challenge lasts 10 minutes and is cancelled when the dialog closes |
| A key outlives its use | It expires after 30 days. Disconnect revokes it, and offline Studio says until when it stays valid |
| The key goes to another server | Each key is bound to its connection's address. The host refuses redirects to another host and never sends one connection's key to another |
| Private Paperclip data lands in git | The connection file holds no data. The cache is in the app data folder, outside every workspace, and a test checks that caching changes no workspace file |
| A late approval does harm | Offline, writes are refused and never queued |
| An item from one instance is answered in another | Every ID carries its connection and company. A source refuses an item of another connection or company as `not-found` |
| Polling overloads the shared server | 30 seconds in front, minutes in the background, no polling for a closed window |

## Consequences

- Inbox and Messenger can be built now against the fake, alongside the client.
- Paperclip's API isn't a stable public API, and an upgrade can break the
  client. We keep the client small and test it against our server's version.
- The draft requirements become active, and move to the package that holds
  their code, in the pull request that builds it.
- Julian reviews this record, and the host side and sign-in as security
  changes. The maintainer approves the new package and the notification
  dependency before they are added.
- Phase 2 (the phone) goes through the desktop, so the key never leaves it.
  That needs its own record once the gateway protocol changes.
