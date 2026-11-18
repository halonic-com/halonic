# Decision: the sharing strip says "Up to date" or "Couldn't check for updates", and Share pressed twice is ignored

- Task: HAL-1302 (T9, sharing, audit item 5, second part)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-1302 (checklist part 2, 2.3, from the board-approved design of source control)
- Kind: user-visible

## What changes

The requirement `source-control.share-versions` gains three behaviours. When the page first sees a shared copy it asks that copy what it has, once. With every version shared and nothing waiting, the strip says "Shared with your team. Up to date." with no action. When the shared copy can't be asked, the strip says "Couldn't check for updates: " and the reason, with Try again. Pressing Share again while a share runs now does nothing and says nothing, where before it showed "Couldn't share". Without a tracking branch, versions are counted against the shared copy's branch of the same name. Nothing was removed or skipped. A teammate's versions in the strip, the larger-repository wording, the phone and a background check follow later.

## Why

After Share the page showed nothing, so a person could not tell "shared and current" from "not checked". The new strips say which it is, and a failed check has a way to try again.

## Covers

- source-control.share-versions
