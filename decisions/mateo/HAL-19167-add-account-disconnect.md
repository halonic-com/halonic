# Decision: the add-account step accepts a disconnected row that reads Not connected

- Approval: the task asks for this change (HAL-19167, Julian's review of #6362); Julian approves
  and signs this note in review
- Kind: internal

## What changes

`studio-click-test.connections-steps`, item 4: after Disconnect, the second row may read Not
connected or Signed out. Before, it had to read Signed out. The README's row 7 says the same.

## Why

Since HAL-19032, Disconnect deletes the connection's key on this computer, and a row with no key
reads Not connected with Sign in (`connections.connection-row`). The step still waited for Signed
out, so it failed as `NOT_DISCONNECTED` on `main` (runs 45749006694 and 45749966189), and the
restart after that failure signed step 3's connection out for steps 8 to 13. The check is no
weaker: the row must still show it can't be used, and the section must still say its key is
revoked.

## Tests

`packages/testing/studio-click-test/src/steps-connections.test.ts`: the default fake shows the row
as Not connected (fails on the old step), a Signed out row still passes, and a row that stays
connected fails as `NOT_DISCONNECTED`.

## Covers

- studio-click-test.connections-steps
