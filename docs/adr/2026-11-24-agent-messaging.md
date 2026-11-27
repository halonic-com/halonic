# Studio's apps talk to agents only through the engine; Paperclip is one provider behind it

- **Status:** Proposed
- **Date:** 2026-11-24

## Context

The board wants to answer its Paperclip cards in Halonic Inbox and to chat with
Paperclip's agents in a new Messenger, first on the desktop (HAL-17422; plan
approved on HAL-10). Paperclip is a separate system with its own API and
sign-in. Halonic doesn't run its agents, and its tasks, comments and cards are
private company data.

The first design let Studio's features read a Paperclip-shaped port. The
board's direction (HAL-10, 24 Nov 10:18 UTC) changed that. The apps talk only
to the engine, through an interface for agents in general, and the engine
handles Paperclip. Later providers, native Halonic agents, phase 2 channels and
the phone use the same interface. The board then decided (10:20 UTC) that the
engine can run in two places: (a) on the desktop and (b) on a server next to
Paperclip. Phase 1 builds (a).

For the data, we looked at three options:

1. **Clone it into the workspace** and keep the copy in sync. Workspaces are
   plain files in git, so private data could end up in a commit. We would also
   resolve conflicts that Paperclip already resolves.
2. **Treat Paperclip as a Remote Hub.** A hub is a folder that Halonic runs, but
   Paperclip's items are neither files nor run here.
3. **Read it live through a provider in the engine**, with a cache outside
   every workspace. We chose this.

## Decision

**Apps see only `AgentMessaging`** (`ports.agent-messaging`). Inbox, Messenger
and the overview read sources, agents, conversations, messages, inbox items
and work. They search, answer an item, send a message, and hear which source
changed. They see no provider's types, IDs or addresses. Every ID is opaque:
it holds the provider, the connection and the provider's own ID, and only that
provider reads it. A task key such as `HAL-10` repeats across instances, so it
is a label and never an ID. Studio features reach the port only through
`studio/services`. They build against `FakeAgentMessaging`
(`contracts.fake-agent-messaging`) until a provider lands.

**The engine serves the port.** It joins every provider's sources into one
`AgentMessaging`. A provider implements the same port for its own connections.
Paperclip is the first provider, in a new `adapters/paperclip-client` package
(the maintainer approves it first). It uses plain `fetch` and adds no
dependency. Its key and the calls it may make live only there.

**Two places the engine can run, one port.** The workspace's environment
chooses which engine Studio talks to, the way Studio already switches between
local, develop and production. No app knows which engine it is talking to.

- **(a) Desktop engine, phase 1.** The desktop agent host runs the provider.
  The key is in the OS keychain, and the host holds it in memory only.
  Studio reads it from the keychain and hands it to the host, as it already
  does for plugin secrets (ADR of 19 Nov).
- **(b) Server engine, phase 2.** `halonic serve` (`host/server` on the Node
  target) runs next to Paperclip, with the provider in it and the key in the
  server's secret store. The desktop holds only its Halonic session.
  `host/server` already has sign-in, sessions, the `Host` and `Origin` checks
  and secret routes. (b) adds the messaging routes there, a TLS endpoint the
  desktop can reach, and putting the key on the server instead of the
  keychain. Our estimate is about one week plus its own security review,
  after phase 1. With (b), no board key sits on a laptop, and the phone and
  several desktops work through the same server. How (b) is built is
  [its own section](#server-engine-b-phase-2-25-nov-2026) below.

**A connection** is one Paperclip instance and company, described in
`connections/paperclip/<name>.yaml`. The file holds a label, the server's
address and the company, and never a key or any data
(`ports.paperclip-connection`). Studio shows each source with its label, such
as "Paperclip · Halonic", and its items are read-only proxies that run nothing
locally. Opening a workspace that holds a connection file makes no call.
Connecting is always a user action: the user first sees the address and the
company. Opening a workspace only restores an earlier Connect made in it (see
*Restoring a sign-in on open*).

**The key** (`ports.paperclip-key`). The board accepted that a board key
carries all of the board's powers. A key from the sign-in route expires after
30 days and covers every company the user belongs to. The keychain entry also
records the address (scheme, host and port) and the company it was made for.
Before every call, the provider compares them with the connection file. If
they differ, it makes no call and Studio asks to connect again, so a pull or a
branch switch that changes the address can't send the key elsewhere. The
engine also binds the key to the workspace it was handed over for (Liam's
review of HAL-17495): a second workspace with a file of the same name, address
and company, such as a clone, gets no call until the person connects it there
too. The keychain entry stays one per connection name, so that second Connect
reuses it.

**Restoring a sign-in on open** (HAL-18910, Liam's OK on HAL-18911). The
engine holds keys in memory only, so after a restart every connection was
signed out and the person had to sign in again each time. The keychain entry
now also lists the workspaces the person signed in from, by the real path the
engine resolved. When one of them opens and may start a run, because the
person has trusted it (or trusts it later) or it reaches only the test model,
like the demo (HAL-19832), Studio hands the key back to the engine once, quietly, but
only when the entry names that workspace and its address
(scheme, host and port) and company match the connection file. Opening replays
an earlier Connect in that workspace; it doesn't start a new one, so a
workspace's files still never decide where a key goes. A clone, a file that
now names another address or company, and an entry saved before this change
get nothing and show *Sign in again*. Disconnect deletes the whole entry, list
included. Nothing else changes: the provider still compares the address and
company with the file before every call, and the engine still binds the key
to the workspace it was handed over for.

The provider sends the key only in the `Authorization` header, uses `https`
(plain `http` only to `localhost`, `127.0.0.1` and `::1`), never turns off
certificate checks, and refuses every redirect, including to the same host.
It sends only the requests on a fixed list of methods and path patterns, and
it encodes every ID as one path segment, refusing `/`, `..` and an empty ID.
Its errors and logs never hold the key, request headers or the body of a
failed answer. Settings says: "This key can do everything the board can in
Paperclip".

**Every waiting item shows in the Inbox** (`inbox.every-waiting-item`, the
board's requirement of 24 Nov 10:35 UTC). Whatever made it (a run, a workflow,
a hub, a chat or a task), an item that waits on the person is in Halonic
Inbox. A chat or a task may show it too, but never only there. So the
Paperclip provider lists every open card addressed to the board across the
whole company, not only those on chat tasks, and each item's `work` links
back to its task. Each item also carries its task's `project`, so the Inbox
can keep its list to one project in one click (`inbox.project-filter`, the
board's requirement of 24 Nov 11:05 UTC); an item without one shows under "No
project". Paperclip has a company-wide read for approvals
(`GET /api/companies/{id}/approvals?status=pending`), but none that we found
for cards on tasks: those live under `GET /api/issues/{id}/interactions`. So
the provider reads the company's open tasks and then each one's cards, within
the polling limits below. If A3 finds a company-wide or filtered card read on
our server's version, it uses that instead.

**The provider's requests** are the whole list. It may list agents, projects,
tasks, comments, cards and pending approvals, read one approval and the tasks
it is linked to, read an agent's picture
(`GET /api/agent-avatars/<segment>` or `<set>/<palette>/<file>`, HAL-18485, HAL-19133), answer a
card, approve or reject an approval, and comment on one of the person's own
chat tasks. It approves, rejects, answers or comments only when the person
does so in Halonic, and shows an approval's type (what approving does) next to
the asking agent's title (Julian's review of the provider, HAL-17437).
Disconnect may also read `/api/cli-auth/me` and revoke the current key.
Starting a sign-in makes a key, so start, poll and cancel are on a separate
sign-in list that only the engine's sign-in flow uses, by the board's exception
to the rule below (HAL-17714, HAL-17439); none of them carries a key. It makes
nothing else, even
though the key could: it never hires, sets budgets, changes settings or deletes
on its own, and no route
that makes, lists or deletes keys. A board key can make more board keys that
never expire, and Disconnect doesn't revoke those (HAL-17423). A new request
needs a security review. The list's file goes on the reviewer paths.

**Sign-in** uses Paperclip's CLI sign-in route, which HAL-17423 tested against
our server. Only the board's own Approve click is still to be tried live.

1. The engine starts a challenge (`POST /api/cli-auth/challenges`) at the
   address the board uses for Paperclip's page. That address must be on
   Paperclip's hostname allow-list. The answer already holds the key, which
   works only after approval. The engine keeps the key in memory and drops it
   if the challenge is cancelled or expires.
2. Studio opens the approval page and shows a random phrase that it also put
   in the challenge's `command` text, so the board approves only that request.
   It shows the 10 minutes the challenge lasts and cancels it when the dialog
   closes.
3. Once a poll says `approved`, `/api/cli-auth/me` must show that the user
   belongs to the connection's company, and the key goes to the keychain.
   Studio's shell takes it out of the engine's answer, writes the keychain
   entry and confirms it to the engine itself, so the sign-in never hands
   Studio's page the key (HAL-20278, section 6.8 of the HAL-17491 note).
   Connect and the restore still read it there until the next pull request
   of HAL-20278.

When a key expires or is revoked, calls get a 401, and Studio asks the board
to sign in again. Disconnecting revokes the key (`revoke-current`) and deletes
the cache, and Studio's shell deletes the keychain entry. If the revoke fails, they are deleted anyway
and Studio says the key stays valid until its expiry and can be revoked in
Paperclip.

**Data: Paperclip stays the only source of truth.** The engine reads it live.
Its cache is in the app data folder, outside every workspace, in files only
the user can read (`ports.agent-messaging-offline`). The cache holds items
only: never a key, a cookie, an `Authorization` header or a whole request or
response. Nothing from Paperclip is written into a workspace.

**Offline.** Apps show the cache with "Offline, as of 14:02". The answer
buttons are off, and a typed message stays a draft. Nothing is queued and
sent later, because an approval sent hours late can be wrong by then. When two
clients answer the same item, the source decides: the second answer gets
`already-answered` with who answered and how.

**Polling** (`agent-host.paperclip-polling`). The engine polls about every 30
seconds while the window is in front, every 5 minutes in the background, and
at once when the window comes back to the front. Timers go through the
`Scheduler` port. Apps don't poll: they read again when `changes` names a
source.

**Agent-written content.** Messages, questions and titles come from agents, so
from whoever can steer one. Apps render them with no raw HTML and no scripts
or `javascript:` links. Links open outside the app, no image loads on its
own, and nothing in them is treated as a Halonic command
(`inbox.agent-inbox-items`, `studio.messenger`).

**Attachments** (`ports.agent-messaging-attachments`, port version 2). Items
and messages list their files with an opaque ID, a name, a media type and a
size, and never an address. An app reads a file's bytes with
`readAttachment`, which the engine serves, so the provider makes the call
with its key and no app ever holds a provider's URL. Apps read a file only
when the person asks to see it: an image in a card shows after a click, never
on its own. The one exception is an agent's picture (`ports.agent-messaging-avatars`,
HAL-18485): the picture the source's own people set for the agent, on the
connection's own host, which apps read on their own to show next to its name.
The agent carries it as an `avatar` ID, read through `readAttachment` like a
file. The Paperclip provider gives one only for a path under
`/api/agent-avatars/`, never for an absolute address, and takes only PNG, JPEG
or WebP of at most 256 KB, checked on the stated length and on the bytes read. Studio draws the image from those bytes in the page, so its
content security policy stays as it is. The name and type come from the
agent, so apps show them as text and draw only common picture types (PNG,
JPEG, GIF and WebP), never SVG.

A message can be sent with files. The engine checks each file's size and type
itself, whatever the screen checked, and refuses the whole message with
`too-large` or `unsupported-type`, so nothing is sent in part.

## Threat model

| Threat | Mitigation |
| --- | --- |
| A stolen key acts as the board in Paperclip | The key is only in the keychain and the engine's memory (in (b), the server's secret store), never in an app, file or log. It expires after 30 days, and Disconnect revokes it. We ask Paperclip for keys limited to these calls. Until then, a full-power key is a risk the board accepted, and Settings says so |
| A stolen key makes a second key that never expires | The provider has no key-making request on its list. Upstream request: a board key can't make keys. Until then the board can list and delete keys in Paperclip |
| A workspace file is changed to a new address, by a pull, a branch or a clone | The keychain entry records the address and company it was made for. The provider compares them before every call and makes no call when they differ |
| An ID from an app or an answer turns one request into another (`x/../../agents/y`) | Every ID is encoded as one path segment, and `/`, `..` and an empty ID are refused. Only requests from the fixed list are sent, and a test checks every request against the list |
| Plain `http`, a bad certificate or a proxy reads the key | `https` only, except to loopback. Certificate checks are never off. The key is sent only in the `Authorization` header |
| A redirect sends the key elsewhere, or from `https` to `http` | The provider refuses every redirect |
| Someone sends the board an approval link for their own sign-in | Studio shows a random phrase that the approval page also shows, and the board approves only that one. A challenge lasts 10 minutes and is cancelled when the dialog closes |
| Agent-written Markdown fakes an answer button or leaks data through an image | No raw HTML, scripts or `javascript:` links. Links open outside the app, and no image loads on its own |
| An attachment leaks that it was opened, or carries script | Its bytes come only through the engine, and only after the person asks. Apps get no address, and draw only PNG, JPEG, GIF and WebP from the bytes, never SVG or HTML |
| An agent's picture leaks that Studio is open, or tracks the person | Only a picture on the connection's own host, read with its key by the engine; an absolute or foreign address gives no picture. PNG, JPEG or WebP only, at most 256 KB |
| The key or a failed answer ends up in a log | Errors carry no headers or answer bodies, and a test searches the logs for a test key |
| Private Paperclip data lands in git | No data in the connection file. The cache is outside every workspace, readable only by the user, and holds no key |
| A late approval does harm | Offline, writes are refused and never queued |
| Polling overloads the shared server | 30 seconds in front, 5 minutes in the background, and no polling while Studio is closed |

## Consequences

- Inbox, Messenger and the overview can be built now against the fake, while
  the provider is built alongside them. No app changes when the engine moves
  to a server or a second provider arrives.
- Paperclip's API isn't a stable public API, and an upgrade can break the
  provider. We keep the provider small and test it against our server's
  version.
- The draft requirements become active, and move to the package that holds
  their code, in the pull request that builds it.
- Julian reviews the provider, the engine's key handling and sign-in as
  security changes. Phase 2 (b) gets its own security review. The maintainer
  approves the new package and the notification dependency before they are
  added.

## Version 4: channels (24 Nov 2026)

Version 2 added attachments (above). Version 3 added action items
([its ADR](2026-11-24-agent-messaging-port-version-3.md)). Version 4 adds
channels: one conversation with several agents. The board
approved them with the phase 2 card (HAL-17544); the shape is section 1.2 of
the phase 2 architecture note (HAL-17511), with Julian's security read
(HAL-17540). `agentMessagingVersion` is 4 (`ports.agent-messaging`).

- **A channel is a conversation with `members`**: 2 to 8 agents of one source,
  its lead among them. `agent` stays and is the lead, the agent who answers
  when the person names no one, so a version 1 app shows a channel as a
  conversation with its lead. `channelMembersFit` is the one check, used by
  every provider and the fake; anything else is refused with `bad-members`.
- **Who a message is for is a field, never text.** `send` takes
  `options.to`, after its files, filled only from the person's picks in the app. Halonic
  never parses `@name` out of a message, so text can't wake an agent (M1). A
  `to` naming anyone outside the conversation is refused with `not-found`
  and sent to no one. `Message.to` shows who was addressed.
- **The author comes from the source** (M2). The port has no way for an app
  to say who wrote a message: what `send` records is always `me`. No call
  lets one agent address another.
- **`Message.work`** gives one line per agent a message went to (starting,
  working, answered, asks you, failed, passed on), and **`InboxItem.risk`**
  marks an approval that spends money or changes who may do what. Only the
  provider sets `risk`.
- **New calls:** `startChannel` and `setMembers`, which only the person makes;
  `browseChannels` for the channels the person isn't in; `joinChannel` and
  `leaveChannel` for the person only, since agents are members only through
  `setMembers`. They are writes, so offline they are refused, never queued
  (`ports.agent-messaging-offline` is unchanged). None of them is reachable
  from the phone.
- **`not-supported`** lets a source without channels refuse cleanly. The
  engine's hub and the desktop client use it until the hub joins channels
  across providers, and the Paperclip provider until it maps them to tasks (a channel is a parent task;
  each agent in `to` gets its own child task, because in Paperclip only an
  assignment wakes an agent).

The new methods and the two new refusals break every implementer and every
exhaustive `switch` on `MessagingRefusal`, so this is a version bump; the
optional fields alone wouldn't be.

## Server engine (b), phase 2 (25 Nov 2026)

The plan is `server-engine` rev 2 on HAL-17512, with Julian's security note on
HAL-17513 (findings S1 to S11). The build tracks its PRs on HAL-18490. Its
requirements start as drafts here and become active in the PR that builds
each one.

- **What runs where.** `halonic serve` runs on the machine Paperclip runs on,
  as its own service user, on `127.0.0.1` only. Its engine workspace holds
  only the connection file, addressed to Paperclip's loopback address. The
  Paperclip key is in the serve profile's secret store, never in an
  environment variable, an argument, the workspace, the unit, an image or CI;
  only the owner adds it after deploy (`server.paperclip-key-store`).
- **Studio still talks to its desktop engine.** In (b) the desktop's hub joins
  a client of the server's messaging routes in place of the local Paperclip
  provider. So no app, not even `studio/services`, knows which engine it talks
  to, and the offline cache and "never queue a write" stay on the desktop. The
  choice is a per-workspace setting in the user's profile, "Messaging engine:
  This computer | Server", never in the workspace file, so a `git pull` can't
  point a desktop's session at another server.
- **The messaging routes** (`server.messaging-routes`) are one route per port
  call, plus `changes` on the event stream. They need a real session in every
  mode, loopback included, are mounted in owner mode only, and `serve` won't
  start the provider without `serve-password`
  (`server.messaging-needs-session`). Writes are limited per session, and one
  poll loop serves every client (`server.messaging-rate`).
- **Signing in a desktop** is device pairing (`server.device-pairing`): a
  one-time code from the console, or from a paired Studio only after the
  password again, a check code shown on both sides, the owner's Allow, then a
  per-device bearer token stored hashed, with idle and absolute expiry, listed
  and revoked one device at a time. The desktop keeps the token in its
  keychain and holds no Paperclip key.
- **The public endpoint** (`server.public-endpoint`): TLS ends at the proxy
  already in front of Paperclip, on its own hostname. `serve
  --public-origin` refuses to start without a password, accepts only that name
  in `Host`, never reads `X-Forwarded-*`, and sets HSTS. The hostname, and
  public or private, are the board's choice (HAL-18503); an A0 delta review
  runs before the name goes public.
- **Routines and no-model steps** for the PR watcher (HAL-17974): `serve` runs
  the workspace's routines with the desktop engine's scheduler
  (`server.routines`), and a workflow `rule` step runs one pure ToolScript
  function in the isolate with no model, network or files
  (`workflow.rule-step`). The watcher's first deploy is loopback only (S9a on
  HAL-18490), so it needs no hostname or pairing.
- **Deploy and rollback** are a runbook (`docs/guides/server-engine.md`); only
  the board's server session deploys. A rollback keeps the key, the device
  sessions and the cache, and never revokes the key; Disconnect does.

| Finding (HAL-17513) | Requirement |
| --- | --- |
| S1 key reachable only through the request list | `server.paperclip-key-store` |
| S2 a real session for messaging in every mode | `server.messaging-needs-session` |
| S3 public TLS endpoint | `server.public-endpoint` |
| S4 pairing sign-in | `server.device-pairing` |
| S5 expiry, bearer only, owner mode only | `server.device-pairing`, `server.messaging-needs-session` |
| S6 write limits, one poll loop | `server.messaging-rate` |
| S7 nothing private in logs | `server.messaging-routes`, `server.paperclip-key-store` |
| S8 the server's cache | `server.paperclip-key-store` |
| S9 key added after deploy, rollback keeps it | `server.paperclip-key-store`, `server.device-pairing` (unknown record version), and the runbook |
| S10 no password, no public start; one `Host` | `server.public-endpoint` |
| S11 a device can't add devices on its own | `server.device-pairing` |

## Version 5: several questions on one item (25 Nov 2026)

A Paperclip card can ask several questions, each single- or multiple-select.
Version 4 carried only one question's options and one option in an answer, so
such a card showed nothing to tick (HAL-18762, from a board report on HAL-10).
`agentMessagingVersion` is 5 (`ports.agent-messaging-questions`).

- **`InboxItem.questions`** holds each question with its prompt, options,
  `selection` (`single` or `multiple`) and `required`. A source sets it only
  for two or more questions or a multiple-select one, and then leaves
  `options` empty. A single single-select question stays in `options` with an
  `option` answer, so the common card is unchanged.
- **The `answers` answer** gives, per question, the IDs of the options picked
  (and a source's kept free text, such as Paperclip's "other" text).
  `answerFitsItem` is the one check: an item with `questions` takes only
  `answers`, no other item takes it, every question and option must be the
  item's own and named once, a single-select question gets at most one option
  and a required one at least one. Anything else is refused with `bad-answer`.
- **The server's wire** caps it: at most 20 questions, 50 options per
  question, IDs of 1 to 256 characters and text of at most 20,000.

A new answer kind breaks every exhaustive `switch` on `InboxAnswer`, as
`action-result` did in version 3, so this is a version bump.

## Version 6: items closed without an answer (26 Nov 2026)

A Paperclip card can end without a decision: someone cancels it, or its time
runs out. Version 5 could say only `open` or `answered`, so the Paperclip
provider dropped such a card and it vanished from Messenger and Inbox without a
reason (HAL-19496, from a board report on HAL-10).
`agentMessagingVersion` is 6 (`contracts.agent-messaging-closed`).

- **The `closed` state** carries `reason` (`cancelled` or `expired`, nothing
  else), `closedAt`, and `by` only when the source says who closed it. A
  provider maps any other unanswered end, such as Paperclip's `failed`, to
  `cancelled`: for the person the card ended without a decision.
- **The `closed` answer outcome**: an answer to a closed item answers nothing
  and gives back its reason and time, as `already-answered` does for an
  answered one, so an app can show the item's final state at once.

A new state breaks every exhaustive `switch` on `InboxItemState` and
`AnswerResult`, so this is a version bump. A local copy made with version 5
reads as missing and is read again.
