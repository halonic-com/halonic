# Decision: a request whose run finishes without a card says "<workflow name> finished"

- Approval: HAL-13771, where the team decided the fallback state of the approved request sheet (HAL-2282)
- Kind: user-visible

## What changes

`inbox.request-run-end` said that when the run finishes without a card, the phone's request sheet
closes and focus goes to **New request**. Nothing said the run had finished: a screen reader heard
only "New request", and the screen still showed the "… started" toast (RS2 in HAL-13765, WCAG
4.1.3). Now the "… started" toast gives way to a success toast "<workflow name> finished" with
**Open run**, read politely as toasts are. A new example covers it.

## Why

Without it the person can't tell whether the request did anything. The toast has the same shape as
"… started" and adds no other new words. The team decided it under HAL-2282, as a fallback state of
an approved screen.

## Covers

- inbox.request-run-end
