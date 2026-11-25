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
- **Runtime:** any
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
| `listTasks` | `GET /api/companies/{company}/issues?status=backlog,todo,in_progress,in_review,blocked&limit=1000` | work, and the tasks whose cards are read |
| `listTasks` with `parentId=` | `GET /api/companies/{company}/issues?parentId={task}&limit=200` | a channel's child tasks, for its work lines and replies |
| `searchTasks` | `GET /api/companies/{company}/issues?q={query}&limit=50` | search: Paperclip's matching tasks, as work or as a chat |
| `listProjects` | `GET /api/companies/{company}/projects` | each inbox item's project, from its task |
| `listChats` | `GET /api/companies/{company}/chats` | the signed-in user's chats; 404 when Agent Chat is off |
| `listComments` | `GET /api/issues/{task}/comments?order=desc&limit=100` | a chat's newest messages |
| `listTaskCards` | `GET /api/issues/{task}/interactions` | a task's cards |
| `listApprovals` | `GET /api/companies/{company}/approvals?status=pending` | pending approvals, company-wide |
| `getApproval` | `GET /api/approvals/{approval}` | who decided an approval first |
| `listApprovalTasks` | `GET /api/approvals/{approval}/issues` | the task an approval belongs to |
| `commentOnChat` | `POST /api/issues/{task}/comments` | send a message, with a `clientRequestId` |
| `acceptCard`, `rejectCard` | `POST /api/issues/{task}/interactions/{card}/accept`, `/reject` | answer a confirmation |
| `respondToCard` | `POST /api/issues/{task}/interactions/{card}/respond` | answer a one-question card |
| `approve`, `rejectApproval` | `POST /api/approvals/{approval}/approve`, `/reject` | decide an approval |
| `whoAmI`, `revokeKey` | `GET /api/cli-auth/me`, `POST /api/cli-auth/revoke-current` | disconnect (track A4) |
| `spendSummary`, `spendByProvider` | `GET /api/companies/{company}/costs/summary?from=`, `/costs/by-provider?from=` | paid money, the budget, and tokens of every billing type |
| `spendByAgent`, `spendByAgentModel` | `GET /api/companies/{company}/costs/by-agent?from=`, `/costs/by-agent-model?from=` | each agent's spend and tokens by model |
| `budgetsOverview` | `GET /api/companies/{company}/budgets/overview` | each agent's monthly budget |
| `seatsSummary` | `GET /api/plugins/halonic.seats/api/seats/summary?companyId=`, with `&from=` for spend | seats by label, windows, the pool's proposal, when a failed read ran; with `from=`, the range's runs with no seat (left out if that read fails; `refresh` doesn't ask for it) |
| `pullRequestsSummary` | `GET /api/plugins/halonic.agent-tools/api/github/summary?companyId=` | pull requests and the merge queue |
| `pullRequestDetail` | `GET /api/plugins/halonic.agent-tools/api/github/pr/{number}?repo=&companyId=` | one pull request; `{number}` a positive integer |
| `getTask` | `GET /api/issues/{task}` | before a task write: the task's ID and company |
| `wakeTask` | `PATCH /api/issues/{task}` with exactly `{ assigneeAgentId, status: "todo", comment }` | a workflow wakes an agent on a task |
| `finishTask` | `PATCH /api/issues/{task}` with exactly `{ status: "done", comment }` | a workflow closes a task as done |
| `commentOnChannel` | `POST /api/issues/{task}/comments` | send a message in a channel: a comment on its parent task |
| `createChildTask` | `POST /api/companies/{company}/issues` with exactly `{ title, description, parentId, assigneeAgentId, status: "todo" }` | one child task per agent a channel message is for |
| `listLabels` | `GET /api/companies/{company}/labels` | find the company's `channel` tag |
| `createChannelLabel` | `POST /api/companies/{company}/labels` with exactly `{ name: "channel", color: "#6366f1" }` | make the `channel` tag when the company has none |
| `createChannel` | `POST /api/companies/{company}/issues` with exactly `{ title, description, labelIds: [one], status: "backlog" }` | start a channel: its parent task, unassigned |
| `updateChannel` | `PATCH /api/issues/{task}` with exactly `{ description }` | change a channel's members line: members, lead, who follows it |
| `listTaskActivity` | `GET /api/issues/{task}/activity` | a channel child task's history: who passed it to whom |

**Live check of `TeamStatus`.** `pnpm test:live` reads a real server with every `TeamStatus` method and
fails unless each of the rows from `spendSummary` to `pullRequestDetail` answers 200 and maps. It never runs
in `pnpm test` or CI. The seats and GitHub routes answer only a board key, so a board user runs it, with
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

**At most 1000 open tasks.** The provider reads one page of `listTasks`, Paperclip's largest. Open tasks
past the first 1000 are missing from work and the Inbox, without an error. Paging comes when a company
gets near that; ours has about 400.

**Search** uses Paperclip's issue search (`searchTasks`, the `listTasks` route with `q=`, so it reads
nothing the provider couldn't already) in the connection's company, all states included. A matching chat
task comes back as its conversation, any other task as work. Agents match by name and chats by title from
`listAgents` and `listChats`; inbox items match by question from the Inbox as last read, so a search reads
no cards. Messages and documents aren't searched in phase 1. A blank query makes no request.

**Card kinds:** confirmations and one-question cards can be answered here. Cards with several questions,
task suggestions, checklists and verdicts show in the Inbox with no options and are answered in Paperclip.
Cards addressed to an agent aren't listed. A chat waits on the person when Paperclip marks it `waiting`.
Tasks' blockers aren't read yet (`blockedBy` is empty).
