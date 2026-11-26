# Decision: bound the request log's writes and masking

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19284#comment-aedf0e96-829f-4144-952f-e81014245f8f (Liam approved the change to `app.integration-request-log` in his review; a team decision with no board card, HAL-2282 rule, because nothing a user sees changes)
- Kind: internal

`app.integration-request-log` gains its bounds, from Julian's security conditions on HAL-19170. A runner can make refused requests in a tight loop, and before this each one queued its own write, read up to 4 MB of code again and scanned it once per path segment.

- While a file is being written, at most 200 requests and 200 failure notes wait for it, the oldest of each type dropped first. What waits goes in one write with one read of the code, made at write time and never cached.
- A code file over 1 MB, or past 4 MB of code in all, is skipped when masking, and so is one that can't be read. Only the first 64 segments of a path are looked at. Each limit masks more, never less.
- Removing an integration or forgetting a workspace drops what waits first. A forget waits for a running write and refuses new lines meanwhile, so the folder can't come back.

The requirement is still `Since: unreleased`, and nothing passes a request log to the loader yet, so no user sees the change.

## Covers

- app.integration-request-log
- packages/adapters/fs-node/src/request-log-limits.test.ts
- packages/adapters/integration-runner/src/halonic/request-log-writer.test.ts
