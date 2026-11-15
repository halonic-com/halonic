# Decision: the Google sign-in requirement also covers cancelling a pending sign-in

- Requirements: `server.google-sign-in`
- Task: HAL-9812, from HAL-714 (step 7's Cancel)
- Approval: HAL-9827, Liam's task; Liam reviews and signs this note
- Kind: internal

## Covers

- `server.google-sign-in`

## What changes

The requirement grows; nothing it allowed before is refused and no test was weakened.
`DELETE /api/google/setups/<ref>/sign-in` drops the account's pending sign-in and records
`sign-in-dropped`. It uses the same sign-in and same-site checks as the start route and answers
204 whether or not a sign-in was pending. An unknown setup ref answers 404 `google_setup_not_found`,
like the other setup routes.

## Why

The build plan (D7) says Cancel drops the pending sign-in on the host. Without a route, a callback
that arrives after Cancel would still be accepted.
