# Decision: What changed on a phone, and focus after See all history

- Task: HAL-1302 (T9, phone, audit item 8, second part)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-1302 (checklist part 2, 2.12 and 2.13, from the board-approved phone design of source control; focus fix from Liam's review of #3501)
- Kind: user-visible

## What changes

A new requirement, `source-control.whats-changed-phone`: on a phone, What changed shows the item's changes in words only, with no Advanced and no line diff. Undo these changes is the page's bottom bar, Open *name* is a 48px row under the changes, and a failed roll-back's warning comes first.

The existing requirement `source-control.changes-phone` changes in two places:

- The sentence "While their phone layouts are not built, the item rows, What changed and the version page shall follow the desktop pages." is replaced. Item rows now say what the phone does (the ⋮ in the row's padding, no chevron), What changed has its own requirement, and only the version page still follows the desktop page.
- One sentence and one example are added: pressing See all history moves focus to the first version that was hidden before, because the button that had focus is gone.

Nothing is removed from the behaviour; no test is weakened or deleted.

## Why

The phone checklist asks for a What changed page that fits a small screen, with the main action at the bottom within thumb reach. Without the focus move, a keyboard or screen-reader user lands on the page itself after See all history and loses their place.

## Covers

- source-control.whats-changed-phone
- source-control.changes-phone
