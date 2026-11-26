# paperclip-client.budget-incidents

- Status: active
- Since: unreleased
- Source: HAL-18921, follow-up to HAL-18872 (approved by Liam on HAL-18872); Paperclip's resolve route read from our server's `/api/openapi.json`

When the person approves or rejects a `budget_override_required` approval, the Paperclip provider shall resolve the approval's budget incident instead of only recording the answer: it shall read the approval, find the active incident whose `approvalId` is that approval in `GET /api/companies/{company}/budgets/overview`, and send `POST /api/companies/{company}/budget-incidents/{incident}/resolve` with exactly `{ "action": "raise_budget_and_resume", "amount": <cents> }` for Approve or exactly `{ "action": "keep_paused" }` for Reject. A budget override's Approve shall take a required note labelled "New limit, in dollars", read as dollars with up to two decimals (a `$` in front and commas between thousands allowed) and sent as whole cents. The provider shall send nothing, and say why, when the amount can't be read, when it isn't above what was already spent, or when Paperclip has no budget stop open for the approval; when Paperclip refuses the new limit, it shall say so with Paperclip's reason. When the approval was already decided, it shall answer `already-answered` and send nothing. Request changes stays the approval's own route.

## Examples

- Given Acme's Website project stopped at its $100.00 limit after $125.50, with a pending budget override,
  when the person approves with "$250.50",
  then the provider sends `resolve` with `{ "action": "raise_budget_and_resume", "amount": 25050 }`.
- Given that override,
  when the person rejects it,
  then the provider sends `resolve` with `{ "action": "keep_paused" }`.
- Given that override,
  when the person approves with "125.50",
  then nothing is sent, and the answer fails with "The new limit must be more than the $125.50 already spent."
- Given a budget override that was already approved,
  when the person approves it,
  then the answer is `already-answered` and nothing is sent.
