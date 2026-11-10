# Decision: the ActionBar takes an id and a reason per button, and marks only the first busy one

- Approval: component specs 8 and 15.3 ([HAL-175](/HAL/issues/HAL-175#document-component-specs)) and Liam's note on #1041; the package owner (Elena) approves this note, Liam reviews it in the pull request
- Kind: internal
- Task: HAL-3517

## What changes

`kit.action-bar` gains two things a form sheet needs from its bar: a button may take its own `id`,
kept while it's busy, and an `unavailable` reason, which keeps it focusable and makes it ignore
presses. While a button is busy, only the first busy button carries the id the others point at, so
two busy buttons never share an id. The rest of the sentence and the existing examples don't
change, and no test was weakened or removed.

## Why

The Dialog's phone form sheet draws its confirming button in an ActionBar. While that button is
busy, the sheet's Close at the top is unavailable with the busy button as its reason, so it needs the
button's own id. The `unavailable` reason lets a screen keep a sheet's button visible and focusable
when it can't be used yet, as specs 23 A1 asks. The first-busy-button rule is Liam's note on #1041.

## Covers

- kit.action-bar
