# Decision: the webhook delivery lease gets a clock-skew margin, and every refusal runs one signature check

- Approval: the package owner (Liam) approves this in review of #2462 on HAL-8512
- Kind: internal
- Task: HAL-8467

## What changes

`server.webhooks` changes in two sentences:

- The delivery id is claimed for 660 seconds instead of 600: two windows and a
  60 second margin, so the lease still holds for a request sent 300 seconds
  early and replayed at the far edge of the window.
- Every refusal before the signature is proven runs the same signature check,
  against a fixed dummy key when there is no real secret.

## Why

At exactly 600 seconds the lease could run out while the timestamp was still
inside the window, so a captured request could start a second run. The extra
HMAC check keeps the refusal paths from being told apart by the cost of the
signature check. The routine lookup and the secret read still run on some
paths only; that is a tracked follow-up on HAL-8467.

No test was weakened.

## Covers

- server.webhooks
