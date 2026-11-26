# Decision: a budget override's Approve raises the limit and resumes, Reject keeps it paused

- Task: HAL-18921
- Approval: Liam reviews this change on HAL-18921, the follow-up he approved on HAL-18872.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:jfjtzp9YALHuOYg1hbprlbJYb4Xiu9cxGDjsD6dxIY+w0ef67rWLv1c3TQTsUVMINIujhiMDBEXpUpYmCOb0BQ==

## What changes

Approving a Paperclip budget override in the Inbox or Messenger now asks for the new limit, in
dollars, and resolves the approval's budget incident with `raise_budget_and_resume` and that
amount in cents, so the limit goes up and the paused work resumes. Reject resolves it with
`keep_paused`. Before, both only recorded the answer, and the budget had to be raised in
Paperclip. Request changes is unchanged.

The requirement `paperclip-client.approval-fields` said the budget override's question has "a line
saying that approving records the answer only and leaves the budget and the paused work as they
are", with an example saying the budget stays the same until it is raised in Paperclip. Both now
say that approving raises the limit to the amount entered and resumes the paused work, and point
to the new requirement `paperclip-client.budget-incidents`.

One expectation in `packages/adapters/paperclip-client/src/approval-fields.test.ts` changes to the
new wording of that line: the same check on the new text. The fixed request list test
(`client-search.test.ts`) gains the `raiseBudget` and `keepBudgetPaused` rows, each pinned in
`budget-incidents.test.ts`. No test was weakened, skipped or removed.

## Why

Paperclip's `POST /api/approvals/{id}/approve` only records the answer for
`budget_override_required`; only the budget incident's resolve route raises the limit and resumes
the work. So an Approve in Halonic left the work paused, and the Inbox could only say so.

## Covers

- paperclip-client.approval-fields
- packages/adapters/paperclip-client/src/approval-fields.test.ts
- packages/adapters/paperclip-client/src/client-search.test.ts
