# Decision: a digest watch closes only once its event source has stopped

- Approval: Liam asked for this in his review of #2019 on [HAL-6670](/HAL/issues/HAL-6670); the package reviewer (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:LfZiwrzKbd/pu1cL55BIc/EMOte5ao0+sAa5ulbTBi2Gl3YH38BFuAjTpafxmUnRE9PvK+hJCw1JGexMdcaoDg==
- Task: HAL-6670

## What changes

The stop function a store's `WatchEvents` gives back may now return a promise (`StopEvents` in
`@halonicjs/adapter-watch-kit`). `DigestWatch.close()` stops the events once, however often it is
called, lets a batch being read finish, and then waits for that promise. A failure to stop is
ignored, as fs-tauri did before #2019. fs-tauri's shell watch gives back the promise of its
`fs_unwatch`, so `await watch.close()` again means the shell's watch is gone. fs-node and fs-web
stop at once and are unchanged.

The requirement `watch-kit.digest-watch` gains one sentence saying this. Two tests cover it in the
kit, and one in fs-tauri with a shell whose `fs_unwatch` answers later.

In `packages/adapters/fs-tauri/src/shell-watch.test.ts`, the test "doesn't read a finished write
back" loses its last three lines: the change from outside after the write was reported by the old
code as well, so it checked nothing new. What the test is about, that no `fs_read` follows the
write, is still checked. The kit's own test "takes the store's write as seen, so a change from
outside right after it is reported" covers the rest.

The note for #2019 (`decisions/priya/HAL-6586-fs-tauri-watch-kit.md`) said fs-tauri tells its
watches about its own changes "as in fs-node", but fs-node had its own copy, `#ownChange`. fs-node
now calls the kit's `runOwnChange` too, so all three file stores share it. Its writes and removes
always apply or throw, so it behaves as before.

## Why

Before #2019, fs-tauri's `close()` waited for `fs_unwatch`. Without that, a caller that closes a
watch and opens a new one has two watches open in the shell for a moment.

## Covers

- watch-kit.digest-watch
- packages/adapters/fs-tauri/src/shell-watch.test.ts
- packages/adapters/watch-kit/requirements/digest-watch.md
