# Decision: budget notices read the typed cause, and the month's row has no × and goes first

- Task: HAL-10915
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12735 (Sofia's UX acceptance rows B2 and B4, built on the approved flow-inbox 4.1 and 4.3; a team decision with no board card, HAL-2282 rule)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:iUJ6XuN+ECq6Dby92xnZlMNzbcCS5VP92Yj6ggCvvXUmhhGn4ZPeVCZ18lidr8de+ofm4OG6wQIf8XIvplOBBg==

## What changes

`inbox.budget-notices`:

- A per-run row takes the limit, the spend and the currency from the run's typed cause
  (`budget.run`, from `engine.budget-stops`), not from the engine's error text. The error text is
  now only the fallback for a run logged before the cause. When neither gives the amounts, the row
  names no amount, where before it had no row at all.
- The sentence "Every row has its ×, and the rows are listed with the other notices, newest first"
  is replaced. A per-run row keeps its ×. The month's row has no ×, **Delete** doesn't dismiss it,
  and it is listed first, above every other notice.

`studio.inbox-notices`: a dismissal never hides the month's row, so a key kept on the device
from before the × went doesn't hide it either.

No test is skipped or deleted, and tests for each new rule are added. One test fixture changes:
in `apps/studio/src/inbox/workspace-notices.test.ts`, the run that uses up the month's budget gets
the `budget.month` cause a run the monthly budget stopped has in its log. Without a cause, and with
an error that isn't the run budget's, that run now gets a per-run row with no amounts (B2), which
isn't what the test is about. What the test checks is unchanged.

## Why

The approved flow (flow-inbox 4.1, 4.3) says the month's row can't be dismissed while it is true
and goes first: while it is true no run starts, and a hidden row would leave the person without
the reason their routines went quiet. The typed cause has been in the run summary since HAL-12012,
so the screen no longer needs to read the engine's words.

## Covers

- inbox.budget-notices
- studio.inbox-notices
- apps/studio/src/inbox/workspace-notices.test.ts
