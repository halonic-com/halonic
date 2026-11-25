# Decision: the Inbox lists and decides secret proposals and join requests

- Task: HAL-18873
- Approval: Liam reviews this change on HAL-18873 after Julian's security review, part of the board's ask on HAL-18861 (every Paperclip approval works in Inbox and Messenger).
- Kind: user-visible

## What changes

The Paperclip provider's fixed request list gains six rows: list, approve and reject for the
company's secret proposals and join requests. Each write row pins its body: approve sends `{}`
(no `overrides`, no `cascade`), a secret proposal's reject only `{ reason }`, a join request's
reject `{}`. Proposal and join request IDs must be UUIDs.

The guard test `packages/adapters/paperclip-client/src/key-routes.test.ts` refused every row
whose path holds `secret`. It now allows exactly the three board rows under
`/api/companies/:company/secret-proposals` and checks there are exactly three, and every other
row is still checked against the same pattern. It gains two forbidden routes: an agent's own
`GET` and `POST /api/agents/me/secret-proposals`, the one that carries a value. The fixed list
test (`client-search.test.ts`) gains the six rows. No test was skipped or removed.

## Why

The board asked to decide everything that waits on it from Halonic (HAL-18861). These routes
list and decide proposals; none makes, lists or deletes a Paperclip key, and none carries a
secret's value: Paperclip's board view leaves out the sealed value, and the provider reads only
the fields it shows, never one whose name starts with `value`, which a test checks. Approving a
secret proposal does create the company secret the agent proposed, from the value Paperclip
already holds; that is the decision the person makes, and Halonic never sees the value.

## Covers

- paperclip-client.board-requests
- agent-host.paperclip-key
- packages/adapters/paperclip-client/src/key-routes.test.ts
- packages/adapters/paperclip-client/src/client-search.test.ts
