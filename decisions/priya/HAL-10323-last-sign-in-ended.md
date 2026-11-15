# Decision: the setup record says how the last sign-in ended

- Approval: team call under the HAL-2282 rule, for the rows in the board-approved Google setup design (HAL-621, section 3.5, step 7); Liam to confirm on the pull request
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:d+ss1petpSfzQ330mYPy8jioE7u04KA/S8WWSs3UGbSQqKrOxty2pTij1OZo7/2tVtHTVOQethOw6rLdKVjtBQ==
- Task: HAL-10323

## What changes

- `server.google-sign-in` gets a paragraph and an example: a callback that ends as a cancel, a refused client secret or an admin block gets `lastSignInEnded` on the record, `{ kind, at }` with `kind` one of `cancelled`, `secretRefused`, `adminBlocked`. It holds a fixed word and a time, never text from Google. A new sign-in, a good or wrong-account sign-in and any other ending clear it.
- `server.google-sign-in` and `server.google-setup-write`: Studio can send `{ kind: "address-changed" }` on `PATCH`, which clears `wrongAccountAt` and makes the host forget the other address.

## Why

Step 7 has to show three rows that come back through the callback, and the record had no field for them. After the connector's address changes, a wrong-account note about the old address would be wrong.

## Covers

- server.google-sign-in
- server.google-setup-write
- packages/host/server/src/google-sign-in-routes.test.ts
