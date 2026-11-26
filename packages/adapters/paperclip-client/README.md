# @halonicjs/adapter-paperclip-client

The Paperclip provider behind `AgentMessaging` (ADR `docs/adr/2026-11-24-agent-messaging.md`). It reads
one Paperclip company's agents, chats, cards, approvals and tasks over plain `fetch`, answers cards and
approvals, and sends chat messages. It makes only the requests on its fixed list (`src/requests.ts`).

`PaperclipTeamStatus` serves `TeamStatus` for the same connection, read-only: spend from Paperclip's cost
routes and seats from the `halonic.seats` plugin. Paid money is what Paperclip billed, so subscription work
is 0 in money and shows in tokens. Pull requests and the merge queue come from the `halonic.agent-tools`
plugin's stored GitHub snapshot, so Halonic holds no GitHub token. A pull request's author is an agent of
the company, "the board" or "outside contributor", never a login, and its GitHub link is kept only when
`isAllowedWebLink` passes it.

- **Layer:** adapters
- **Owner:** ravi
- **Runtime:** node (the events socket's upgrade uses `node:tls`)
- **Public API:** `@halonicjs/adapter-paperclip-client`

## Example

```ts
import { PaperclipMessaging } from "@halonicjs/adapter-paperclip-client";

// The engine hands in the address, the company and the key from the keychain; the key stays in memory.
const messaging = new PaperclipMessaging({
  address: "https://paperclip.acme.test",
  key,
  connection: "acme",
  company: "c0000000-0000-4000-8000-000000000001",
  label: "Paperclip · Acme",
});
const open = (await messaging.listInboxItems()).filter((item) => item.state.kind === "open");
await messaging.refresh(); // the engine's poll; `changes()` then names the source if anything changed
```

## What it refuses

- An address that isn't `https`, except plain `http` to `localhost`, `127.0.0.1` and `::1`; an address with
  a user name, password, path or query.
- Every redirect, to the same host or another. Certificate checks are the platform's and can't be turned off.
- An ID that isn't one path segment (`/`, `\`, `.`, `..`, empty, or anything outside `A-Z a-z 0-9 . _ ~ -`):
  nothing is sent.
- Writes while offline: `refused` with `offline`, never queued.
- A message to a task that isn't one of the person's chats: it checks the chat list first and sends
  nothing.
- A key with a character a header can't carry (a line break, a control character): refused when the
  client is made, so it never reads as `offline`.

**Writes follow the person.** The provider answers a card, approves or rejects an approval, or comments
on a chat only when the person does so in Halonic (`answer` and `send`). It never writes on a poll or a
retry. An approval always shows its type, which says what approving does (such as `hire_agent`), above
the title the asking agent wrote.

**Risky approvals.** Every inbox item carries a `risk`. An approval is `risky` when approving it spends
money or changes who may do what (`hire_agent`, `budget_override_required`, `approve_ceo_strategy`), and
also when its type is missing or one the provider doesn't know, so a new kind of approval fails closed.
Only `request_board_approval`, which just records the board's answer, is `normal`, and so is every card.
The risk comes from Paperclip's type, never from the asking agent's title. A phone can't answer a risky
item unless the desktop allows it (requirement `paperclip-client.approval-risk`).

**Route timing.** Pass `timing` (for example `logRouteTimings(log)`) and every request reports its
method, route template, status, milliseconds and body bytes (counted after `fetch` decompressed
the body, so not network bytes), such as
`paperclip GET issues/:task 200 312 ms 18944 B`. It names the route as the request list writes it, so a
record never holds an ID, a query string, a header, the key or a body (requirement
`paperclip-client.route-timing`). The sink must not throw: its error would replace the call's answer.

**Channels** (`paperclip-client.channels`, K1). A channel is an open parent task with the `channel` tag that a
person made, never an agent, with a members line the provider writes (2 to 8 agents, the lead among them). A
message in a channel is a comment on that task, and each agent in `to`, or the lead when `to` is empty, gets one
child task assigned to it, holding only the person's text, quoted and labelled as the board's. In Paperclip only
an assignment wakes an agent, and the provider never reads a name out of the text, so a typed `@Bo` wakes
nobody. Reading a channel also reads its child tasks (`paperclip-client.channel-work`): only those the person
made, holding the line that ties them to one of the person's messages, count. Each gives the work lines under
that message (one "passed on" line per hand-off between agents, from the task's activity, then the holder's state
from the task's status), and each agent's comment on it shows in the channel as that agent's message. Reading
posts nothing. A child task Paperclip refused carries Paperclip's own error text as the line's reason.

**Starting a channel and its members** (`paperclip-client.channel-membership`). `startChannel` makes the parent
task with the person's key, the `channel` tag (made once if the company has none), status `backlog` and no
assignee, so a comment on it wakes no agent. Paperclip keeps no followers on a task, so the members line also
names the people who follow the channel: `setMembers`, `joinChannel` and `leaveChannel` rewrite only that line,
and `browseChannels` lists the channels the person made and doesn't follow. Members are checked (2 to 8 of the
company's agents, the lead among them) before any write. Titles are kept to one line of at most 80 characters.

**Workflow task writes.** `PaperclipTasks` gives workflows (phase 3, step 4) two writes on the same connection:
`wake` assigns a task to an agent with status `todo` and a comment, and `finish` sets status `done` with a
comment. Both are Paperclip's task update, so their rows on the list also pin the body: exactly those fields,
each a non-empty string, and that one status. The client refuses any other body before anything goes out, so
neither can change a title, a blocker, a budget or another status. It reads the task first and writes only to a
task of the connection's company. Like the person's writes, a task write is sent once or refused, never queued.

**Stepper requests.** With a `stepperCatalog`, a confirmation card that pins a revision of its task's document
`stepper-request` becomes an action item carrying that revision (`InboxItem.stepper`), checked with
`validateStepperRequest` and then the port's allow-list. Every list reads the document's latest revision again,
because Paperclip doesn't touch a task when a document changes, and marks the item as changed when a newer one
exists. Studio's `action-result` is written back as the task document `stepper-result`, one summary comment and
the card accepted or rejected. The three rows for this name their document key in the path, so the key reads
`stepper-request` and writes `stepper-result` and nothing else. How agents write one:
`docs/guides/paperclip-stepper-requests.md`.

The key goes only in the `Authorization` header. Errors name the request and why it failed, never the key,
a header or the body of a failed answer.

## Paperclip endpoints used

Checked against our server's Paperclip version (commit `c0f1328`, 18 Nov 2026).

| Request | Route | What for |
| --- | --- | --- |
| `listAgents` | `GET /api/companies/{company}/agents` | agents, and authors' names |
| `readAgentAvatar` | `GET /api/agent-avatars/{segment}` | an agent's picture, when its `avatarUrl` is a path under `/api/agent-avatars/`: PNG, JPEG or WebP, at most 256 KB |
| `readAgentAvatarSet` | `GET /api/agent-avatars/{set}/{palette}/{file}` | Paperclip's own agent pictures, read like `readAgentAvatar` and without their `?size=` query |
| `listTasks` | `GET /api/companies/{company}/issues?status=backlog,todo,in_progress,in_review,blocked&view=index&sortField=id&sortDir=asc&limit=1000`, then `?updatedSince=…&view=index&sortField=id&sortDir=asc&limit=1000`, each with `&afterId=` for the next page | work, and the tasks whose cards are read: the open tasks once, then only what changed |
| `listTasks` with `parentId=` | `GET /api/companies/{company}/issues?parentId={task}&limit=200` | a channel's child tasks, for its work lines and replies |
| `searchTasks` | `GET /api/companies/{company}/issues?q={query}&limit=50` | search: Paperclip's matching tasks, as work or as a chat |
| `listProjects` | `GET /api/companies/{company}/projects` | each inbox item's project, from its task |
| `listChats` | `GET /api/companies/{company}/chats` | the signed-in user's chats; 404 when Agent Chat is off |
| `listComments` | `GET /api/issues/{task}/comments?order=desc&limit=100`, then `?after={comment}&order=asc&limit=100` | a chat's newest messages, then only the new ones |
| `listTaskCards` | `GET /api/issues/{task}/interactions` | a task's cards |
| `listApprovals` | `GET /api/companies/{company}/approvals?status=pending`, then `?status=revision_requested` | pending approvals, and those waiting on the agent after Request changes, company-wide |
| `getApproval` | `GET /api/approvals/{approval}` | before Approve or Reject: whether it is a budget override; who decided an approval first; once for a listed approval gone from the waiting ones, for its final state (`paperclip-client.closed-items`) |
| `listApprovalTasks` | `GET /api/approvals/{approval}/issues` | the task an approval belongs to |
| `listApprovalComments` | `GET /api/approvals/{approval}/comments` | auto approvals in shadow mode: who has commented on an approval |
| `listCompanyActivity` | `GET /api/companies/{company}/activity?entityType=approval&entityId={approval}` | auto approvals in shadow mode: an approval's `approval.created` entry |
| `readNeverList`, `listNeverListRevisions` | `GET /api/issues/{task}/documents/never-list`, `/revisions` | auto approvals in shadow mode: the never-list's lock and latest revision, and every revision with its author |
| `readStopDocument`, `listStopDocumentRevisions` | `GET /api/issues/{task}/documents/auto-approve-stop`, `/revisions` | auto approvals in shadow mode: the stop document, read the same way |
| `commentOnChat` | `POST /api/issues/{task}/comments` | send a message, with a `clientRequestId` |
| `acceptCard`, `rejectCard` | `POST /api/issues/{task}/interactions/{card}/accept`, `/reject` | answer a confirmation |
| `respondToCard` | `POST /api/issues/{task}/interactions/{card}/respond` | answer a question card, every question at once |
| `submitVerdicts` | `POST /api/issues/{task}/interactions/{card}/verdicts` | approve, reject or defer a verdict card's items, some or all |
| `approve`, `rejectApproval` | `POST /api/approvals/{approval}/approve`, `/reject` | decide an approval |
| `listDecisions` | `GET /api/companies/{company}/decisions?status=open&limit=100`, and `?status=decided` before an answer; `decided`, then `expired`, then `cancelled` only while a listed decision is gone from the open ones | the board's open decisions; who decided one first; a gone decision's final state (`paperclip-client.closed-items`) |
| `decide` | `POST /api/decisions/{decision}/decide` with `{ optionId, idempotencyKey }` | pick one option of a decision |
| `listSecretProposals`, `listJoinRequests` | `GET /api/companies/{company}/secret-proposals?status=pending`, `/join-requests?status=pending_approval` (no filter before an answer) | what agents propose as secrets or bindings, and who asks to join; never a value |
| `approveSecretProposal`, `rejectSecretProposal` | `POST /api/companies/{company}/secret-proposals/{id}/approve` with `{}`, `/reject` with `{ reason }` | decide a secret proposal; no overrides, no cascade |
| `approveJoinRequest`, `rejectJoinRequest` | `POST /api/companies/{company}/join-requests/{id}/approve`, `/reject`, each with `{}` | decide a join request |
| `raiseBudget`, `keepBudgetPaused` | `POST /api/companies/{company}/budget-incidents/{incident}/resolve` with exactly `{ action: "raise_budget_and_resume", amount }` (whole cents, 1 to 2147483647) or exactly `{ action: "keep_paused" }`; `{incident}` a UUID | Approve or Reject a budget override: raise the limit and resume, or keep paused. The incident is the one `budgetsOverview` lists for the approval |
| `requestApprovalRevision` | `POST /api/approvals/{approval}/request-revision` with `{ decisionNote }` | Request changes: send an approval back to the agent that asked |
| `whoAmI`, `revokeKey` | `GET /api/cli-auth/me`, `POST /api/cli-auth/revoke-current` | whom a connection is signed in as (its name only); disconnect (track A4) |
| `spendSummary`, `spendByProvider` | `GET /api/companies/{company}/costs/summary?from=`, `/costs/by-provider?from=` | paid money, the budget, and tokens of every billing type |
| `spendByAgent`, `spendByAgentModel` | `GET /api/companies/{company}/costs/by-agent?from=`, `/costs/by-agent-model?from=` | each agent's spend and tokens by model |
| `budgetsOverview` | `GET /api/companies/{company}/budgets/overview` | each agent's monthly budget; before a budget override's answer, its active incident |
| `seatsSummary` | `GET /api/plugins/halonic.seats/api/seats/summary?companyId=`, with `&from=` for spend | seats by label, windows, the pool's proposal, when a failed read ran; with `from=`, the range's runs with no seat (left out if that read fails; `refresh` doesn't ask for it) |
| `pullRequestsSummary` | `GET /api/plugins/halonic.agent-tools/api/github/summary?companyId=` | pull requests and the merge queue |
| `pullRequestDetail` | `GET /api/plugins/halonic.agent-tools/api/github/pr/{number}?repo=&companyId=` | one pull request; `{number}` a positive integer |
| `chatNotes` | `GET /api/plugins/halonic.agent-tools/api/chat-notes/{task}?companyId=` | when a chat has a comment with no author: which comments the front bot posted, shown as the chat agent's automatic messages |
| `boardMentions` | `GET /api/plugins/halonic.agent-tools/api/board/mentions?companyId=&since=` | every Inbox read: the comments on open tasks that mention the signed-in person with Paperclip's mention link, shown as `comment` items |
| `prWatcherPass` | `GET /api/plugins/halonic.agent-tools/api/pr-watcher/pass?companyId=` | the served `pr-watcher` workflow: the last watcher pass's rule input and the actions the watcher took (`at`, `input`, `actions`, `truncated`) |
| `listReactions` | `GET /api/plugins/halonic.agent-tools/api/reactions/{task}?companyId=` | a chat's message reactions, kept by the agent-tools plugin; 404 reads as not supported |
| `setReaction` | `POST /api/plugins/halonic.agent-tools/api/reactions/{task}?companyId=` | adds or removes the person's own reaction; the body is exactly `{ commentId, emoji, on }` |
| `getTask` | `GET /api/issues/{task}` | before a task write: the task's ID and company; once per chat whose full answer is linked by identifier: that identifier |
| `wakeTask` | `PATCH /api/issues/{task}` with exactly `{ assigneeAgentId, status: "todo", comment }` | a workflow wakes an agent on a task |
| `finishTask` | `PATCH /api/issues/{task}` with exactly `{ status: "done", comment }` | a workflow closes a task as done |
| `getRun` | `GET /api/heartbeat-runs/{run}`, `{run}` a UUID | before Stop or Run again: the run's company, agent, task and `canStop`, read again (nothing else kept) |
| `cancelRun` | `POST /api/heartbeat-runs/{run}/cancel`, no body | Stop, only while Paperclip says the run can stop; Run again wakes through `wakeTask` |
| `commentOnChannel` | `POST /api/issues/{task}/comments` | send a message in a channel: a comment on its parent task |
| `createChildTask` | `POST /api/companies/{company}/issues` with exactly `{ title, description, parentId, assigneeAgentId, status: "todo" }` | one child task per agent a channel message is for |
| `listLabels` | `GET /api/companies/{company}/labels` | find the company's `channel` tag |
| `createChannelLabel` | `POST /api/companies/{company}/labels` with exactly `{ name: "channel", color: "#6366f1" }` | make the `channel` tag when the company has none |
| `createChannel` | `POST /api/companies/{company}/issues` with exactly `{ title, description, labelIds: [one], status: "backlog" }` | start a channel: its parent task, unassigned |
| `updateChannel` | `PATCH /api/issues/{task}` with exactly `{ description }` | change a channel's members line: members, lead, who follows it |
| `listTaskActivity` | `GET /api/issues/{task}/activity` | a channel child task's history: who passed it to whom |
| `readFullAnswer` | `GET /api/issues/{task}/documents/full-answer` | a chat's full answer: read once per list, only when an agent's reply links that chat's `full-answer` document; kept only as Markdown of at most 64 KB. No other document key, and not the document list |
| `createFeedbackTask` | `POST /api/companies/{company}/issues` with exactly `{ title, description, projectId, assigneeAgentId, status: "todo", idempotencyKey }`, the key starting `halonic-feedback:` | screenshot feedback: one task; a repeated key gets the task already made |
| `listTaskAttachments` | `GET /api/issues/{task}/attachments` | before an upload: whether the feedback's screenshot is already there; for the Inbox, the files of a task with a card for the person (`paperclip-client.card-files`) |
| `readAttachmentContent` | `GET /api/attachments/{file}/content` | a picture a card lists, only when the person asks: PNG, JPEG, GIF or WebP, at most 10 MB, its leading bytes matching its type |
| `attachScreenshot` | `POST /api/companies/{company}/issues/{task}/attachments`, multipart, one `file` part | the feedback's screenshot: a PNG of at most 10 MB, the only file any row sends |
| `listIssueRuns` | `GET /api/issues/{task}/runs` | a chat's messages: each run's agent, status, start and the comments that woke it, for `readAt` (nothing else kept) |
| `liveEvents` | `GET /api/companies/{company}/events/ws`, a WebSocket upgrade only | live events: which record changed, so the local copy reads it again (`LiveEventsConnection`) |

**Live events** (`paperclip-client.live-events`, HAL-19338). `LiveEventsConnection` opens the company's
events socket with our own WebSocket client: an HTTP/1.1 upgrade over `node:tls` and the frame code of
`@halonicjs/adapter-websocket-frames`, no library. The `liveEvents` row is an upgrade only: `fetch` refuses
it, and only the transport's `openSocket` sends it. The key goes only in the `Authorization` header, never
`?token=`; the address is `wss`, or plain `ws` only to this computer; a redirect is never followed; and a
frame over 1 MB closes the connection (1009) before any of it is held. It sends `live.hello` and
`live.interests` with no run IDs, so no run log is ever sent, and tells its owner `open`, each event
(an `activity.logged` cut to its action, entity type and entity ID, or any other type's name), `resync`
and `closed` with the close code and why. Paperclip answers a board key with 403 until it accepts board
keys on the socket; that closes as `not-allowed`. Reconnecting is the owner's: a connection opens once.

**Live check of `TeamStatus`.** `pnpm test:board` reads a real server with every `TeamStatus` method and
fails unless each of the rows from `spendSummary` to `pullRequestDetail` answers 200 and maps. It never runs
in `pnpm test` or CI: it is not named `test:live`, the script the `live-cloud` workflow runs in every package
a change reaches, because CI has no board key (HAL-18378). The seats and GitHub routes answer only a board key, so a board user runs it, with
the key in the environment, never on the command line: `HALONIC_PAPERCLIP_LIVE_ADDRESS` (the server's
address), `HALONIC_PAPERCLIP_LIVE_KEY` and `HALONIC_PAPERCLIP_LIVE_COMPANY` (the company ID). Its log names
the Paperclip version, each request with its status, how many items mapped, and the public number of the
pull request whose detail it read; it prints nothing else it read. It picks a pull request that is queued,
dequeued, failing or merged, because one waiting for review has no timeline step to map, and fails when the
seats plugin is served but lists no seats.

**No route that makes keys.** Nothing goes to Paperclip upstream (board, HAL-10, 24 Nov), so this list is the
main protection. No entry makes, lists or deletes keys or tokens: not `/api/board-api-keys`, an agent's
keys, setup or gateway tokens, secrets, or the sign-in challenge (`POST /api/cli-auth/challenges`), which
makes a key. Just before `fetch`, the client checks the exact method and path against the list again, and
refuses a request off it before anything goes out.

**Sign-in** (track A4, HAL-17439) has its own list, `src/sign-in-requests.ts`, by the board's exception to
the rule above. Only `PaperclipSignInClient`, which the engine's sign-in flow uses, sends it, and none of its
requests carries a key: a challenge is polled and cancelled with its own secret.

| Request | Paperclip route | Used for |
| --- | --- | --- |
| `createChallenge` | `POST /api/cli-auth/challenges` | start a sign-in; the answer holds a key that works only after the board approves |
| `pollChallenge` | `GET /api/cli-auth/challenges/{challenge}?token=…` | `pending`, `approved`, `cancelled` or `expired` |
| `cancelChallenge` | `POST /api/cli-auth/challenges/{challenge}/cancel` | the dialog closed or the 10 minutes passed; a refused cancel is followed by a poll, and `approved` means the key is revoked |

The client reads the new key's owner and revokes it through `whoAmI` and `revokeKey` on the messaging list.

**Every waiting item** (`inbox.every-waiting-item`): `GET /api/companies/{company}/interactions` doesn't
exist on our version, and `GET /api/companies/{company}/attention` is a board-only feed whose shape we
haven't tested with a board key yet. So the provider reads the open tasks and then each one's cards, but
reads a task's cards again only when the task's `updatedAt` changed: Paperclip touches a task whenever a
card on it is made or answered. The first read of a company with about 400 open tasks makes about 400 card
reads, 4 at a time; later polls read only the tasks that changed. A task without `updatedAt` has its cards
read on every poll. Each poll reads the open tasks once, for both the Inbox and the work list, and an
approval's linked task is read once while it is pending.

**Delta reads** (`paperclip-client.delta-reads`, HAL-19334). The provider keeps the open tasks in memory.
The first read loads them with `view=index`, in pages of 1000 by task ID. Every later read asks only for
the tasks Paperclip changed since the watermark, less 30 seconds, with no status filter, so a task that
closes comes back once and leaves the list. The watermark is the newest `updatedAt` on a read's first
page: pages go by ID, so a task on an earlier page can change while a later one is read. While a read is
unfinished it keeps the last task ID it read, so a page boundary among equal `updatedAt` values, or a
failed page, resumes after that ID instead of reading the same tasks again. A read where nothing changed
is one request. One read in 10 loads the open tasks whole again and replaces the list, so a task that
leaves Paperclip's list without changing (deleted, hidden, or an external conversation waiting on the
other side) leaves by then.

`view=index` sends no description, so a task that may be a channel (the channel tag, made by a person)
is read whole with `getTask`, and again only when its `updatedAt` changed. Paperclip before v2026.1117.0
answers 400 to `view=index`; the provider then reads the open tasks as one plain page of 1000 on every
read, as before delta reads.

A chat's messages are read whole once. Later reads ask for the comments after the second-newest one
kept, so the newest comment comes back first as Paperclip has it now: a deleted or blanked newest
message shows at once, and when it is gone altogether the newest page is read whole. One read in 10 also
reads the newest page whole, because `after` doesn't see an older comment deleted or blanked.

**Search** uses Paperclip's issue search (`searchTasks`, the `listTasks` route with `q=`, so it reads
nothing the provider couldn't already) in the connection's company, all states included. A matching chat
task comes back as its conversation, any other task as work. Agents match by name and chats by title from
`listAgents` and `listChats`; inbox items match by question from the Inbox as last read, so a search reads
no cards. Messages and documents aren't searched in phase 1. A blank query makes no request.

**Card kinds:** confirmations and question cards can be answered here. A question card with several
questions, or a multiple-select one, becomes an item with `questions` and takes an `answers` answer, sent as
one `respondToCard` request (`paperclip-client.question-cards`); one with a single single-select question
keeps plain `options`. Checkbox, item-verdict and task-suggestion cards also become items with `questions`
(`paperclip-client.card-kinds`): a checkbox or task card is one multiple-select question, accepted with
`acceptCard` and the options or tasks picked, and rejected with the `reject` option and its reason; a verdict
card asks one optional question per item still open, and each answer goes out with `submitVerdicts`.
Cards addressed to an agent aren't listed. A chat waits on the person when Paperclip marks it `waiting`.
Tasks' blockers aren't read yet (`blockedBy` is empty).
