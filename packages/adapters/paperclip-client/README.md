# @halonicjs/adapter-paperclip-client

The Paperclip provider behind `AgentMessaging` (ADR `docs/adr/2026-11-24-agent-messaging.md`). It reads
one Paperclip company's agents, chats, cards, approvals and tasks over plain `fetch`, answers cards and
approvals, and sends chat messages. It makes only the requests on its fixed list (`src/requests.ts`).

`PaperclipTeamStatus` serves `TeamStatus` for the same connection, read-only: spend from Paperclip's cost
routes and seats from the `halonic.seats` plugin. Paid money is what Paperclip billed, so subscription work
is 0 in money and shows in tokens. Pull requests and the merge queue follow in a second pull request.

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

The key goes only in the `Authorization` header. Errors name the request and why it failed, never the key,
a header or the body of a failed answer.

## Paperclip endpoints used

Checked against our server's Paperclip version (commit `c0f1328`, 18 Nov 2026).

| Request | Route | What for |
| --- | --- | --- |
| `listAgents` | `GET /api/companies/{company}/agents` | agents, and authors' names |
| `listTasks` | `GET /api/companies/{company}/issues?status=backlog,todo,in_progress,in_review,blocked&limit=1000` | work, and the tasks whose cards are read |
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
| `seatsSummary` | `GET /api/plugins/halonic.seats/api/seats/summary?companyId=` | seats by label, windows, the pool's proposal |

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
