# paperclip-client.board-requests

- Status: active
- Since: unreleased
- Source: board ask on HAL-18861 (every Paperclip approval works in Inbox and Messenger), gap table "Other things that wait on the board"; task HAL-18873

The Paperclip provider shall list every pending secret proposal (`GET /api/companies/{company}/secret-proposals?status=pending`) and every join request waiting for approval (`GET /api/companies/{company}/join-requests?status=pending_approval`) in the inbox, each `risky`, with the options Approve and Reject. A secret proposal shall show its name and key, or for a binding the agent, the secret's name and the setting path, and the agent's justification; it comes from the agent that proposed it, with the task it proposed it from as its work. The provider shall never read a proposal's field about its value (any field whose name starts with `value`), nor anything of a join request's agent defaults but the variable names and binding types `paperclip-client.risky-reach` reads, so no part of a secret reaches an item, a log or the cache. When Paperclip says the person can't approve a proposal, the item shall offer only Reject and say why. A proposal's Reject shall take an optional note labelled "Why are you rejecting this?", so the agent can learn why; a join request's Reject takes no note.

When the person approves, the provider shall send `POST …/secret-proposals/{id}/approve` or `POST …/join-requests/{id}/approve` with the empty body `{}`, so it never renames a secret or approves another proposal with it. When the person rejects, it shall send `POST …/secret-proposals/{id}/reject` with `{ "reason": <the person's note> }`, or `{ "reason": "Rejected in Halonic." }` without a note, since Paperclip requires a reason, and `POST …/join-requests/{id}/reject` with `{}`. When the request was already resolved, it shall answer `already-answered` with who resolved it. When Paperclip refuses the person a list, the inbox shall show the rest.

Connection authorizations aren't listed here: they are task cards of the kind `connection_intent`, answered only in Paperclip's own flow, and the inbox links to them (`paperclip-client.card-kinds`).

## Examples

- Given Ada's pending proposal of the secret "Acme deploy token" with key `ACME_DEPLOY_TOKEN` and the reason "The website deploy needs it.",
  when the inbox is read,
  then it shows "New secret: Acme deploy token" with the key, the reason, and Approve and Reject, and no part of the value.
- Given that proposal,
  when the person rejects it without a note,
  then the provider sends `reject` with `{ "reason": "Rejected in Halonic." }`.
- Given that proposal,
  when the person rejects it with the note "Use the shared token instead.",
  then the provider sends `reject` with `{ "reason": "Use the shared token instead." }`.
- Given a join request from Sam,
  when the person approves it,
  then the provider sends `approve` with `{}`.
