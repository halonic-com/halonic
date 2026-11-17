# Decision: the budget stop gets its Inbox notices and a refusal at start

- Task: HAL-11630, from the UX check (HAL-11613, B1)
- Approval: Liam, in review of HAL-11630 (his signature is added there). The words are the approved ones of microcopy 6.5 and 10.3, so no board card.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:hxE9cQZDFzqJbg/mp1u4L1Emo78C/9iatk9rF9EJ9c5Dov7/MnPISPeJdUh9WcdkjNWbBy4GU79GJFGIrZmZDQ==

## What changes

- `inbox.budget-notices` (new): Notices lists a run the run budget stopped ("*Workflow* stopped at its estimated budget · Reached €5.00 per run (estimated €5.08) · 2 hours ago", **Open run**) and, once the month's estimated spend reaches the monthly budget, one row "This month's estimated spend reached its budget of €50.00. Runs won't start until 1 December (UTC) or until you change the budget." with **Change budget**.
- A request from the Inbox isn't started while the month's budget is used up. The line under the form says "Not started: this month's estimated spend reached its budget of €50.00." with **Change budget**, and the message stays.
- `studio.inbox-notices` includes the budget notices and the refusal.

## Why

The monthly stop was reachable but silent: nothing in the Inbox said it, and a request started a run that failed at once. Nothing is taken away; a workspace without a monthly budget behaves as before.

## Covers

- inbox.budget-notices
- studio.inbox-notices
