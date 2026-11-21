# Decision: the Inbox's rows say which run they are

- Task: HAL-12528
- Approval: a team decision with no board card (HAL-2282 rule), the team's HAL-12461 decision (option a) on Sofia's a11y check Q1 (HAL-12426); Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:OqlZcybOPvp98n3VaZZAYX9ZaMy7jzBtisfTTvY91xsRSeJeZlPNmu2qGYkdZ4YL4Zm6vi0fUDYPca5+0mqdBA==

## What changes

With two runs of one workflow waiting, the Inbox's rows read the same, on screen and to a screen
reader ("Approve this reply? · Support reply · a person step · Waiting 18 min"). Only their order
told them apart (WCAG 2.4.6).

- `inbox.page`: a row's line now says the run's short id after its workflow, "Support reply · run
  891b5a · a person step · Waiting 18 min". The id comes from `shortRunId`, the one `halonic runs`,
  the run page and Home's Recent runs use. The row has no label of its own, so the id is in the name
  a screen reader hears. The row still shows none of the run's input (option b, rejected for that).
  The requirement's sentence on the line is reworded to say this, and it gains an example.
- `inbox.home`: Needs you shows the Inbox's rows through the same builder (HAL-12615), so its
  example row gains the id too. Its sentence is unchanged.

No new words beyond the HAL-12461 decision.

## Covers

- inbox.page
- inbox.home
