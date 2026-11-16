# Decision: the Changes page's sharing strip, Get updates and History fit a phone

- Task: HAL-10667
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-1302#document-plan (the approved T9 plan, step 6, phone frames F8 to F13)
- Kind: user-visible

## What changes

The requirement `source-control.changes-phone` now also covers three parts of the Changes page on a phone.
The sharing strip says "Only on your computer." with the hint "Add where to share on a computer." and has
no action. Get updates is a 48px button at the end of the header. History's Show more is a full-width 48px
button, and its "Halonic on your computer isn't answering." note has a 48px Try again.

The sentence that said the sharing strip and History follow the desktop pages "while their phone layouts
are not built" no longer names them. No example was removed or weakened, and two were added.

## Why

The approved T9 plan lays these parts out for a phone (frames F9 to F13). The item rows, What changed and
the version page are not on `main` yet, so they stay in that sentence until their phone layouts are built.

## Covers

- source-control.changes-phone
