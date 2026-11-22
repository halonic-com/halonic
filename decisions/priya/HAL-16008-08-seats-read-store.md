# Decision: a seat signed in to another account isn't asked for its usage

- Approval: /HAL/issues/HAL-16008 (Liam's review of #5080, "must do in 4c")
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:i6osyd0kp6SEQhfvyHSX7ZO9yWyU7BP2oJnu0+TEpD8lw7bXDYYyM+qRkx3VdFRp2E50E/hsPSMhsXVsBo/eCg==
- Task: HAL-16008

## What changes

`paperclip.seats-read` now runs `claude -p /usage` only for a Claude subscription sign-in on the seat's own account. A seat signed in with a subscription on another account gets the same reading as a signed-out seat: the error `signed-out`, no windows, and `/usage` isn't run. The wrong-account alert stays as it was.

## Why

Before, a seat signed in to another account still had its `/usage` read and stored as a good reading. That would put another account's usage under this seat and feed it into the forecast (Liam's review of #5080 on HAL-16008).

## What doesn't change

The time limit, the bare environment, no shell, and the retries (one more try after a time-out or an unreadable answer, none after a rate limit) stay as they are. The plugin isn't installed yet, so no stored readings change.

## Tests

No test was weakened. `read-seat.test.ts` adds a case for a seat signed in to another account: the reading's error is `signed-out` and `/usage` isn't run.

## Covers

- paperclip.seats-read
- tooling/paperclip/src/seats/read/read-seat.test.ts
