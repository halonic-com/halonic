# Decision: the phone Select opens the picker sheet

- Approval: component specs 4 ("On a phone: a picker field") and 15.3 ([HAL-175](/HAL/issues/HAL-175#document-component-specs)), and `aria-haspopup="dialog"` decided on [HAL-3514](/HAL/issues/HAL-3514); the package owner (Elena) approves this note, Liam reviews it in the pull request
- Kind: internal
- Task: HAL-3517

## What changes

`kit.select` said the phone button opens the system's picker "until the kit's picker sheet exists".
The sheet is in the kit now (#1046), so the sentence and two examples say the button opens it:
`aria-haspopup="dialog"`, the sheet titled with the label, a pick saves and closes, Close keeps the
value, focus goes back to the button. The native select hidden under the button is gone; a hidden
input carries the value for a form that posts.

In `select.test.tsx` the two system-picker tests (`showPicker`, and the Safari focus fallback) are
replaced by three sheet tests: pick, Close, and an unavailable option. The test that the hidden
select stays out of the accessibility tree is replaced by one that there is no select at all. The
file has 17 tests, one more than before.

The phone button no longer sets `aria-invalid`, which a button doesn't support (HAL-3567 review);
the error still reaches screen readers through `aria-describedby`, and the test checks that now.

## Why

The follow-ups from the Select's review (HAL-3567, #1040) were planned for when the Select moves
to the sheet. The Safari fallback and the `showPicker` patch in the tests go away with the system
picker.

## Covers

- kit.select
- packages/studio/kit/src/select/select.test.tsx
