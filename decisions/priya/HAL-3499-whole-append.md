# Decision: a record append writes all its lines, and a failed one may be seen until it is cut back

- Requirement: `fs-node.record-store-files` (`packages/adapters/fs-node/requirements/record-store-files.md`)
- Task: HAL-3499, a follow-up from Liam's review of #997 (HAL-3495)
- Approval: [HAL-3499](/HAL/issues/HAL-3499) asks for this change; Liam approves it in review
- Kind: internal

## What changes

Two sentences of the requirement get more exact; nothing it promised before is taken away:

- "A change shall count once its line break is written" now ends "unless its append fails and is
  cut back". Reads take no lock, so another process can see the lines of a failing append for the
  moment before the store cuts them back. The requirement now says so.
- New: "An append shall write all of its lines, or fail." The store made one write call and ignored
  how many bytes it took, so a short write left a torn tail that the next append cut off, and the
  change was lost without an error. It now uses `FileHandle.writeFile`, which writes until all
  bytes are in.

## Tests

No test was weakened or removed. One test was added: with every write taking at most 10 bytes,
an append still stores its whole line. It failed before the fix.

## Covers

- fs-node.record-store-files
