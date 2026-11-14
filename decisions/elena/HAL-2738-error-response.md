# Decision: one error body shape for the server, with an optional `fix`

- Task: HAL-2738
- Approval: Liam approves this note in review on the review task HAL-9172
- Kind: internal

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
