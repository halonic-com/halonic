# Decision: Restore just this names what a folder inside a larger repository will need

- Task: HAL-1302 (T9, History actions, audit item 7, follow-up to #3780)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-1302 (Liam's review of #3780)
- Kind: internal

## What changes

The "Not covered yet" line of `source-control.history-restore` gains a note for HAL-9756: History gives paths from the repository root, while Restore just this reads and writes files from the workspace folder. Today that can't differ, because a folder inside a larger repository only shows the larger-repository notice. When HAL-9756 lands, the read needs `<id>:./<path>` and paths relative to the folder. No behaviour changes, and no sentence or example is removed.

## Why

Liam asked for it in the review of #3780, so the gap is written down where the HAL-9756 work will look.

## Covers

- source-control.history-restore
