# Decision: a history with no version yet counts nothing to share

- Task: HAL-1302 (T9, sharing, audit item 5, third part)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-1302 (checklist part 2, 2.3, from the board-approved design of source control)
- Kind: user-visible

## What changes

The requirement `source-control.share-versions` gains one sentence: while the history has no version yet, nothing is counted as unshared, whatever the shared copy holds. Before, a history with no version that tracked a shared branch asked git for a range it could not read, and the page showed "Couldn't check for updates". Nothing was removed or skipped.

## Why

A new folder that is linked to a shared copy before its first version should show no sharing strip rather than a failure.

## Covers

- source-control.share-versions
