# Decision: the phone Select shows an option's reason and an empty text

- Approval: component specs 15.3 ([HAL-175](/HAL/issues/HAL-175#document-component-specs)), findings 1 and 2 of Sofia's design check ([HAL-3734](/HAL/issues/HAL-3734)); the package owner (Elena) approves this note, Liam reviews it in the pull request
- Kind: internal
- Task: HAL-3804

## What changes

`kit.select` gains two sentences and two examples. On a phone, an unavailable option shows its
reason as its description in the picker sheet, and a Select with no options shows its empty text
in the sheet instead of an empty list. `SelectOption` gets an optional `reason` and the Select an
optional `emptyText`, both passed on to the PickerSheet. Nothing is removed or weakened: the
existing test of an unavailable option without a reason (no second line) stays, and two tests are
added.

The desktop Select stays the native `<select>`, whose list has no room for a second line, so a
reason shows on a phone only. That matches the spec: 15.3 is the phone picker.

## Why

Spec 15.3 says an option that can't be picked shows why as its description; the model picker's
"Only models Claude Code can use" needs it. Before this change the Select passed an empty reason
and an empty `empty`, so the sheet showed no reason and opened blank with no options.

## Covers

- kit.select
