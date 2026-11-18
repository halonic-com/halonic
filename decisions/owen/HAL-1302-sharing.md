# Decision: the Changes page shows "N versions aren't shared yet" with Share, and a toast says what came of it

- Task: HAL-1302 (T9, sharing, audit item 5, first part)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-1302 (checklist part 2, 2.3, from the board-approved design of source control)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:fjUqmd0Av0ZUVJhxp6PyzBGEsG8uD6EyF2/uY3Z7uMfOtIEDRbjAPKkw6eeUit/kyA6KDcpkl1dw1kXKVbhPDA==

## What changes

A new requirement, `source-control.share-versions`: when the folder has a shared copy and versions it lacks, the page shows "1 version isn't shared yet" (or "N versions aren't shared yet") with Share 1 version (or Share N versions). Sharing shows "Sharing…" with no action, then the toast "Shared N versions". A failure shows "Couldn't share" with the reason and "Nothing was sent." and Try again. The strip is neutral, not amber, and git's own output is never shown. Nothing was removed or skipped. The other strip states, the phone and the background check follow in later pull requests.

## Why

Without Share, a person can add a shared copy and get updates but cannot send their own versions, so the sharing half of the Changes page is missing.

## Covers

- source-control.share-versions
