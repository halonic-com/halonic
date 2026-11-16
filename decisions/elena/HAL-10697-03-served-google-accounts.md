# Decision: the Google setup list also carries the connector address and services

- Task: HAL-10697
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-10697 (team decision, no board card: it reuses the approved step 7 text, HAL-10741 UX check by Sofia)
- Kind: internal

## What changes

`GET /api/google/setups` also returns each setup's connector address and services, so a served window can build the read-only step 7 layout without a second request. A served window gets a read-only accounts source that reads this list and refuses every change without sending a request.

The requirement `server.google-setup-list` gains these cases. No test was weakened or skipped.

## Why

A served Studio window has no Google routes of its own (HAL-10697).

## Covers

- server.google-setup-list
