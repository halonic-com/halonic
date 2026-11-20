# Decision: Restore just this no longer lists Go back as not covered

- Task: HAL-1302 (T9, follow-up to #4113 and #4114)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-1302 (Liam's review of #3780)
- Kind: internal

## What changes

The "Not covered yet" line of `source-control.history-restore` drops "Go back, and the line about versions already shared": both are built and covered by `source-control.history-go-back` since #4113. The HAL-9756 note stays. No behaviour changes, and no example is removed.

## Why

The requirement shouldn't point at something as missing once it is on `main`. #4114 kept the words on purpose until #4113 merged.

## Covers

- source-control.history-restore
