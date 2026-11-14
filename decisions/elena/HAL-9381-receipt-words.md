# Decision: the run receipt's approval and cost words follow microcopy §15.2

- Task: HAL-9381, from Sofia's design check (B32, B37)
- Approval: Liam, in review of HAL-9381 (his signature is added there)
- Kind: user-visible

## What changes

- `runs.run-view.receipt-approvals`: an approval line names the action in the Inbox card's plain
  words ("Send an email with Gmail: approved by you at 10:42", else "Use create_note"), not the raw
  tool name.
- `runs.run-view.receipt-models-cost`: a call priced 0 (the built-in test model) never shows an
  amount, it says "built-in test model, no cost" ("no cost" for another model) and adds nothing to
  the total; cached calls beside fresh ones read "2 cached calls".

## Why

Microcopy §15.2 is the approved wording; the receipt still showed tool ids and "€0.00" for a free
call. The change is team-decided small wording on an approved screen (HAL-2282). No behaviour is
removed, and the code is in the same pull request.

## Covers

- runs.run-view.receipt-approvals
- runs.run-view.receipt-models-cost
