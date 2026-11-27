# Decision: a connection whose file no longer matches its key lists as signed out

- Task: HAL-20467, pull request #6794
- Approval: HAL-20467, Liam's review of #6794
- Kind: internal
- Signature:

## What changes

`agent-host.paperclip-connection` gains one case for `signed-out`: besides a key Paperclip refused, a connection whose file no longer matches the address and company its key was made for, as `agent-host.paperclip-connection-file-changed` states. Nothing the requirement promised before is removed or weakened; `no-key` is unchanged.

## Why

The key guard already refuses every request for such a connection, so listing it as signed out at once keeps the row in step with the guard instead of waiting for the next poll. Without this sentence the two active requirements would contradict each other.

## Tests

No test was weakened or removed. `desktop-connections.test.ts` covers the added case.

## Covers

- agent-host.paperclip-connection
