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
select stays out of the accessibility tree is replaced by one that there is no select at all, and
a new test checks that the hidden input isn't posted while the Select is unavailable, as the native
select wasn't. The file has 18 tests, two more than before.

The phone button no longer sets `aria-invalid`, which a button doesn't support (HAL-3567 review);
the error still reaches screen readers through `aria-describedby`, and the test checks that now.
The phone LongText's button (`kit.long-text`, from #1054) drops it the same way: its requirement
sentence, the code and its test (Liam's and Sofia's reviews on HAL-3680 and HAL-3663).

From Noah's visual check (HAL-3699, frames T1-F31 and F35): the phone Select's chevron is 20px,
like the folded LongText's (desktop stays 16px), and `kit.picker-sheet` draws a 1px `border` line
under each row, the last one too, as F31 does. Both requirement sentences and their tests say so.

## Why

The follow-ups from the Select's review (HAL-3567, #1040) were planned for when the Select moves
to the sheet. The Safari fallback and the `showPicker` patch in the tests go away with the system
picker.

## Covers

- kit.select
- kit.long-text
- kit.picker-sheet
- packages/studio/kit/src/select/select.test.tsx
