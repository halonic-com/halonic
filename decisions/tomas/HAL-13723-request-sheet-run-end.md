# Decision: the phone's request sheet ends its wait when the run ends, and Close is plain while it waits

- Approval: HAL-13723, where the team decided the fallback state of the approved request sheet (HAL-2282)
- Kind: user-visible

## What changes

`inbox.request` said the phone's request sheet goes on saying "Working…" until the request's card
arrives, and that Close is always named "Close, keeps your message". A run that fails or finishes
before it asks anything never sends a card, so the sheet waited for ever (RS1 in HAL-13691). Now
the wait also ends when the run ends: the new requirement `inbox.request-run-end` says what the
sheet does then, and `inbox.request` points to it. While the sheet waits, Close is named plain
"Close", because closing then clears the sent message; before Send it keeps its old name. The
example that pressed **Close, keeps your message** while waiting now presses **Close**.

## Why

A first run on a phone without the local model running is the common case, and the person was left
waiting on a run that had already ended. The old Close name promised to keep a message it then
cleared. The team decided both under HAL-2282, as a fallback state of an approved screen.

## Covers

- inbox.request
