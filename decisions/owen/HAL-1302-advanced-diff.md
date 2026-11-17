# Decision: Advanced shows the line diff to everyone, and a file Halonic can't describe has its own layout

- Task: HAL-1302 (T9, PR 4)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-1360 (the T9 UX checklist, part 2: "Advanced diff" and "Halonic can't describe this change"; a team decision on top of the approved screen, HAL-2282 rule)
- Kind: user-visible

## What changes

The line diff of a changed file moves behind an **Advanced** button that every person has, not only the developer view (which used to call it Show lines). Per-part **Discard this part** stays developer-only. A file Halonic can't put in words (no item kind, or unreadable) now shows "Halonic can't describe this change.", one label (CHANGED, NEW or DELETED) with the file name in mono, and Advanced already open; this replaces the one-line "New", "Deleted" or "Changed".

The requirements `source-control.line-diff`, `source-control.discard` and `source-control.change-list` change their words to match, and a new requirement `source-control.cant-describe` covers the layout. No test was weakened or skipped; the tests that pressed Show lines now press Advanced.

## Why

The checklist asks for the Advanced diff at full width for all people, and for the "can't describe" layout, so a person can still see what changed when the words can't say it.

## Covers

- source-control.line-diff
- source-control.discard
- source-control.change-list
