# Decision: a remove waits in the same per-path queue as a conditional write

- Approval: Liam asked for this in his review of #942 (HAL-3311), follow-up point 1 in HAL-3383; the package owner approves this note in review
- Kind: internal
- Task: HAL-3383

## What changes

`ports.definition-store-write-if-unchanged` said writes to one path run one after another, so
another write never comes between the check for `expected` and the write. It now says writes and
removes of one path do, and an example covers a write and a remove at the same time.

## Why

A remove that landed while a conditional write was waiting for its digest was undone by that
write: the write had already checked the old text, then wrote the file back. Running `remove()`
through the same queue closes that gap. Nothing that worked before changes: a remove alone, and
writes and removes of different paths, behave as they did.

The memory, dry-run and kernel test stores do this in this pull request; the folder store does it
in #949. The contract suite doesn't check it yet, because the folder store would fail it until
#949 merges; each store's own tests do.

## Covers

- ports.definition-store-write-if-unchanged
