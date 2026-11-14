# Decision: one error body shape for the server, with an optional `fix`

- Task: HAL-2738
- Approval: Liam approves this note in review on the review task HAL-9172
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:EI+uIXGOnbf0FO2Ms/ofOUq4oc2Yar3/vMTdL6/AGyxvr1cF83tG0ptUlK+O0XKJftrS+1q3Kn0ZZJoWQZh0Cg==

## What changes

`ServerErrorBody` gains an optional `fix`. The `server.api` requirement text and example are
updated to match. Nothing is renamed or removed: `errorResponse` and its callers stay as they were.

## Why

`kindedErrorResponse` returns the `fix` of a `KindedError`, and there is to be one error body
shape for the server: `{ code, message, fix? }`, with `code` set to the error kind.

## Tests

The `server.api` type test now expects `code | message | fix`. No test was weakened or removed.

## Covers

- server.api
