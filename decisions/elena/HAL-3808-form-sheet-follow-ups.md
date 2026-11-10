# Decision: the ActionBar draws a `danger` decision, so a danger form sheet keeps its colour

- Approval: component specs 8 and 15.3 ([HAL-175](/HAL/issues/HAL-175#document-component-specs)) and Liam's review of #1142 (HAL-3799); the package owner (Elena) approves this note, Liam reviews it in the pull request
- Kind: internal
- Task: HAL-3808

## What changes

`kit.action-bar` lets a button be `danger` as well as `primary` or `secondary`. A `danger` button
is the bar's one decision, like `primary`: the bar refuses a second `primary` or `danger`, or one
that isn't the first button. `kit.dialog-form-sheet` draws its confirming button in the Dialog's
`confirm.variant` (`primary` unless it's `danger`) instead of always `primary`. It also says how far
the alert slot sits from the last field: 16px to an error's Callout, and 12px to the end of the body
when there's none. Each requirement gains one example. No test was weakened or removed.

## Why

A form Dialog that deletes something ("type the name to delete") has `confirm.variant: "danger"`.
On desktop its button is red. On a phone the form sheet always drew `primary`, because the bar
had no `danger`, so the warning colour was silently lost. Refusing `danger` in the form sheet
would have made such a Dialog unusable on a phone. Drawing it keeps the same meaning on both
layouts, and the Button already has the variant. Counting it as the one decision keeps the bar's
rule that only one button stands out.

The spacing is Liam's other review note: the fields' bottom padding and the slot's padding added
up to 24px with no error and 28px with one.

## Covers

- kit.action-bar
- kit.dialog-form-sheet
