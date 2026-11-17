# Decision: each row of the Changes list has a ⋮ with Open and Undo these changes, and the list stops at 200 rows

- Task: HAL-1302 (T9, item rows)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-1360 (the T9 UX checklist, part 2, 2.2: the row's ⋮, "Open Sorter" and "Undo these changes", and "and 340 more" past 200 items; a team decision on top of the approved screen, HAL-2282 rule)
- Kind: user-visible
- Signature: unsigned

## What changes

Each row gets a ⋮ named "More actions for <name>". It lists **Open <name>** for an agent, a workflow or a routine, a divider, and **Undo these changes**, which does what the button on the item's page does (one toast with Undo, the reason when it fails). Neither is in danger red. The list draws at most the first 200 rows and says "and N more" under it.

The requirement `source-control.change-list` gains one sentence for each and two examples. Nothing was removed, weakened or skipped. New tests cover the menu of an agent and of a file no kind places, Undo from the menu, and the 200-row limit.

## Why

The checklist asks for both. Left out on purpose, with the checklist's own fallbacks: who and when under a row (no change record yet), the run-level undo, and a developer-view link under "and N more".

## Covers

- source-control.change-list
