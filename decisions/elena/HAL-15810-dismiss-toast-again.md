# Decision: the first run's Dismiss toast names Show the guide again

- Approval: HAL-15810 (flow check C634 #6 on HAL-15803; the toast names the Help item the board already approved as **Show the guide again** in C520-9, HAL-14977); Liam approves this note in review
- Kind: user-visible

## What changes

`first-run.setup-item`: the toast after **Dismiss** says "To bring it back, pick Help › First run ›
Show the guide again." instead of "… Show the guide.", and the requirement names **Show the guide
again** (`first-run.help`) as the way back. The Dismiss example checks the new line.

## Why

#4733 renamed the Help item to **Show the guide again**, but the toast still named the old item, so
it pointed at a menu item that isn't there. C634 found it.

## Tests

No test was weakened or skipped. `first-run-setup-view.test.tsx`'s Dismiss test checks the toast's
line with the new words; it makes the same `expect` calls as before.

## Covers

- first-run.setup-item
