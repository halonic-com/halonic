# Decision: an open card whose line took the focus isn't read out again

- Approval: https://paperclip.ing/HAL/issues/HAL-20387
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:/Bd8F4AQuUCpLrodupez/aPi+NIOXoxVrMxXtZpsM4j+S5XShVhKsNjYNkor06iAeglaV9ieGrebpQl5fLggAg==

Sofia's words and accessibility check (HAL-20379) found that a screen reader heard an open Inbox
card's end twice. Row L3.7 / L4.5 of HAL-20218's UX acceptance says once. When the card ended
elsewhere with the focus on one of its buttons, or in an action item's stepper, its line took the
focus and was read, then the page's status region said "Ship the release?: Cancelled · 10:00"
again.

Now the Inbox doesn't read that card out again once its line took the focus. With the focus
elsewhere, the line isn't read, so the page still says it once. The words don't change.

Two active requirements say so:

- `inbox.final-state-open`: the line also takes the focus from a stepper that went, and the card
  isn't read out again then. A new example says a card with the focus outside it is still read
  out once.
- `inbox.final-state`: a card whose open card's line took the focus joins the cards that aren't
  read out again, next to a card answered from its card here.

No test is weakened: `agent-open-ended.test.tsx` gets three new tests, and no check changes.

## Covers

- inbox.final-state
- inbox.final-state-open
