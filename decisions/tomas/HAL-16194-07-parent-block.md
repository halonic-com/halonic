# Decision: the unblock sweep's test fake gains the parent-block calls

- Approval: Liam reviews the new relation write and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Ax8H734Ii7rCm7v/vtNaMvPAVTVWfVciKRoLE/oRR46jI6HSqKiztYRibn6TGe8ifG9h5ioVmapT5/G3lQ+ACQ==

The board asked (25 Nov, via HAL-16194) that the plugin fix a task blocked by
its own parent or a task above it (`parent_block`). The PR watcher's unblock
sweep (`paperclip.pr-watcher-unblock`) already reads every blocked task's
blockers and is the one place that sets `todo`, so the rule lives there. Its
Paperclip interface gains `parentOf` and `releaseParentBlock`, and its summary
gains a `parentBlocks` count.

So the existing test `src/pr-watcher/unblock.test.ts` changes in two ways: its
fake Paperclip implements the two new calls (no parents, nothing released),
and the two summaries it compares now include `parentBlocks: 0`. Every
assertion it made still holds; nothing it checked is dropped. The new
behaviour has its own requirement, `paperclip.pr-watcher-parent-block`, and
its own tests.

## Covers

- tooling/paperclip/src/pr-watcher/unblock.test.ts
