# Decision: Escape in a menu inside a Dialog closes only the menu

- Requirement: `kit.menu` (`packages/studio/kit/requirements/menu.md`)
- Task: HAL-3063 (item 7), from Sofia's UX check on HAL-3032
- Approval: Sofia asked for it on HAL-3063; Liam approves this note in review
- Kind: internal

## What changes

The requirement now says what Escape does when the Menu is inside a Dialog: it closes the menu
only, focus goes back to the trigger, and the Dialog stays open. The next Escape cancels the
Dialog as usual. One example is added for it.

The code doesn't change. The Menu already prevents the default of its Escape keydown, and a
browser sends the open modal its `cancel` only for an Escape keydown that nothing prevented. Until
now no test held that, so a later change to the Menu's keys could have closed both at once.

## Why

One Escape should undo one step. Closing a "Delete agent?" Dialog when the user only meant to
close a menu in it throws away what they were doing.

## Tests

No test was weakened or removed. One test was added, `menu-in-dialog.test.tsx`. jsdom doesn't turn
Escape into a Dialog's `cancel`, so the test does what the browser does: it sends `cancel` when
the keydown wasn't prevented. It fails when the Menu stops preventing Escape's default.

## Covers

- kit.menu
