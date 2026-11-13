# Decision: a webhook start follows the routine's overlap setting

- Approval: the package owner (Liam) approves this in review of #2463 on HAL-8512
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:mxWDiTEp1G3s756BSHLz+HI/yyMTeEp5ysOzmPVCAmV9OyZSTALTnXVQEdNluUY8AjrLoCSEHQRXc0Hb17mqDw==
- Task: HAL-8467

## What changes

`server.webhooks` gains one step after the trust gate and before the delivery
id is claimed: when a run of the routine is running or waiting, `skip` answers
202 `{ "skipped": true }`, `queue` answers 429 `webhook_routine_busy` with
`Retry-After: 60` and leaves the delivery id free, and `allow` starts anyway.
One example covers the three settings.

## Why

A webhook routine ignored its `overlap` setting, so a busy sender could start
runs on top of each other. The server stores no request bodies, so `queue`
leaves the waiting to the sender's retry. The check and the start are not one
step, and the requirement says so. Claiming the delivery id on `skip` is a
tracked follow-up on HAL-8467.

No test was weakened.

## Covers

- server.webhooks
