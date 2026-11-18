# Decision: a tiny budget reads "less than €0.001" in Studio, never "of under"

- Task: HAL-12052
- Approval: Liam approves this change on HAL-12052, for HAL-12052. Liam decided the monthly line and Sofia the per-run title (HAL-12066, HAL-12103): small wording on approved screens (HAL-2282 rule), so there is no board card.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:iZEFoK0FbRHsmnstsh1cjBRqKbdgLTM2tol5LY7mxeKHoFWHtu+ZWV/XD73yVkbcL1uAdueH+0k4ybGrfNZaDQ==

## What changes

A budget or spend too small to show (under €0.001) reads "less than €0.001" after "of", as the command line does. The Inbox's monthly line and the refused-request line read "…reached its budget of less than €0.001.", the run page banner reads "…reached its budget of less than €0.001 (estimated less than €0.001 spent).", and the per-run Inbox row reads "Reached its budget of less than €0.001 per run (estimated less than €0.001)". Normal amounts read as before.

The requirements `inbox.budget-notices` and `runs.run-view.failure-banners` get a tiny-amount example each, and each has a test. No test was weakened or skipped.

## Why

"Budget of under €0.001" reads badly. "Reached less than €0.001" reads as if the run reached a smaller amount than it had, so the per-run title names the budget first.

## Covers

- inbox.budget-notices
- runs.run-view.failure-banners
