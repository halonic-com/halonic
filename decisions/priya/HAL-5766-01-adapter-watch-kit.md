# Decision: a finished write is no longer read back by the folder watch

- Approval: Liam asked for this fix in the review of #1840 on [HAL-5804](/HAL/issues/HAL-5804), carried to [HAL-5766](/HAL/issues/HAL-5766); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:idE/i19xGnFNExVVvKNJGUAiyuA8pH91htLvhCfpRENgnJ59rZSXkhBJg927dMDotrB14cHY3N/Ttz/Fm5oyAw==
- Task: HAL-5766

## What changes

One test in `packages/adapters/fs-node/src/folder-watch.test.ts` checked that when the watch
read a finished write back and that read failed, the write still succeeded and the watch was told.
The watch no longer reads a finished write back: it takes the digest the store wrote as seen. So
that test is replaced by two:

- a finished write is not read back, and the watch is not broken;
- a failed write is still read back, and when that read fails too, the write keeps its own error
  and the watch is told.

No requirement is edited or retired. Under `ports.definition-store-watch` one more test runs, and
it makes more `expect` calls than before.

## Why

Reading the file back after the store's write could take in a change another program made right
after it, and that change was then never reported. Recording the written digest closes that gap.
The read-back stays only for a failed write, where the watch can't know what is on disk.

## Covers

- packages/adapters/fs-node/src/folder-watch.test.ts
