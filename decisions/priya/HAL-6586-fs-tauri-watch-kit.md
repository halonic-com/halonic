# Decision: the fs-tauri watch no longer reads a finished write back

- Approval: follows the watch-kit decision (decisions/priya/HAL-5766-01-adapter-watch-kit.md), which Liam asked for in the review of #1840 on HAL-5804; the package reviewer (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:5CPItW6sF17bp4kXCuBdxOWciPShyGD+7LXt5Yrgr/uQ6HnXWk9n8B3Ce8bLy0qHpQ2pv2jYuViGZdjgGkntCw==
- Task: HAL-6586

## What changes

The fs-tauri watch now is `DigestWatch` from `@halonicjs/adapter-watch-kit`, as in `fs-node` and
`fs-web`. One test in `packages/adapters/fs-tauri/src/shell-watch.test.ts` checked that when the
watch read a finished write back and that read failed, the write still succeeded and the watch was
told. The kit no longer reads a finished write back: it takes the digest the store wrote as seen.
So that test is replaced by two, as in `fs-node`:

- a finished write is not read back, and a change from outside right after it is reported;
- a failed write is still read back, and when that read fails too, the write keeps its own error
  and the watch is told.

No requirement is edited or retired. Under `fs-tauri.write-if-unchanged-and-watch` two more tests
run (one for a message the shell sends before `fs_watch` answers), and they make more `expect`
calls than before.

## Why

Reading the file back after the store's write could take in a change another program made right
after it, and that change was then never reported. Recording the written digest closes that gap,
and fs-tauri now shares it with the other two file stores.

## Covers

- packages/adapters/fs-tauri/src/shell-watch.test.ts
