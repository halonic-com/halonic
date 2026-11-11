# Decision: an approval names the subagent that asks

- Approval: security follow-up S1 from the review of #1626 ([HAL-5046](/HAL/issues/HAL-5046#document-review)), task [HAL-5052](/HAL/issues/HAL-5052); the wording builds on the approved Inbox card, so it is a team decision (HAL-2282), checked with Sofia on [HAL-5065](/HAL/issues/HAL-5065); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:4xZzGEik+iAYMHRezP9vcvCgc8exe4NNZUDUv1bFqwl/Hfdnpu2uIYW2ZHh6pLSqVQVTA2GONm0uzizMO1IECw==

## What changes

Since #1626 a subagent's tool call can wait for a person's OK. Its `approval.requested` event
records the `subagent`, but the run summary dropped it, so Studio's Inbox and `halonic runs show`
named the step's agent as the one asking. That misleads when the subagent's own file grants the
connector and the parent's doesn't.

Four active requirements now name the subagent, each with a new example; nothing they said before
changes:

- `events.summary-approvals-and-signals`: a waiting approval lists the subagent that asked, when
  one did (`PendingApproval.subagent`, left out otherwise, so older summaries read the same).
- `inbox.items`: an approval item carries `subagent` (`null` when the agent asked itself).
- `inbox.approval-title`: a subagent's call reads "Checker, for Sorter, wants to use create_note
  (notes-mcp)"; an agent's own call reads as before.
- `cli.run-view`: the step waiting on a subagent's call reads "! Draft a reply   Sorter, for
  Writer · smart".

## Tests

One new test per requirement; no test was removed or changed in what it checks. The expected
item in `inbox-items.test.ts` gains `subagent: null`.

## Covers

- events.summary-approvals-and-signals
- inbox.items
- inbox.approval-title
- cli.run-view
