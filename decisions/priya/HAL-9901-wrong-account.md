# Decision: the host keeps a wrong-account sign-in for Studio's step 7

- Approval: Liam decided this on HAL-9936 as a team call (HAL-2282 rule): the screen and its wording are in the board-approved Google setup design (HAL-621, section 3.5 item 3)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:z3lkY5nFIeGWEOd86ip7T94tesDwwg+qDvzPeW1SOiCsdzixoJRpXXnBYpWOelH5Fk1kCHNXRKboR+LX2SUeBw==
- Task: HAL-9901

## What changes

- `server.google-sign-in` gets a paragraph and an example: when a sign-in comes back for another account, the record gets `wrongAccountAt` (a time, no address), and the host keeps the address in memory only, for ten minutes, behind `GET /api/google/setups/<accountRef>/sign-in/wrong-account`.
- A new sign-in, a good sign-in and a disconnect forget the address. After a restart or ten minutes Studio shows the general text without it.
- There is no route that accepts the other account: Studio changes the connector's address and signs in again.

## Why

Step 7 has to say "You signed in as other@example.com, but this connector is for x@example.com", and the setup record may not hold an e-mail address.

## Covers

- server.google-sign-in
