# Decision: plugin.yaml also refuses control characters and text-direction marks in a choice field's choices

- Task: HAL-12521 (follow-up to HAL-12345, from Liam's review of #3562)
- Approval: the task asks for this change; Liam approves this note in review on HAL-12521
- Kind: internal

## What changes

- `format.plugin-file`: every entry in a `choice` field's `choices` may not contain a control character (Unicode `Cc`) or a text-direction mark (Unicode `Bidi_Control`), like a `label` or `title`. A choice can't break lines. Right-to-left letters and emoji still pass. This covers settings and command forms alike, since both use the same field types. The published `plugin.schema.json` doesn't change.

## Why

Studio shows each choice to the person filling in a setting or a form, so a right-to-left override or another hidden character could make one choice look like another, just as it could with a name or a label. HAL-12345 closed this for the other text in `plugin.yaml`; choices were left out.

## Tests

`plugin.test.ts` extends the HAL-12345 tests: each control character and text-direction mark is refused in a choice, at `ui.settings.units.choices.1`, and right-to-left text and emoji in choices still pass. No test is weakened.

## Covers

- format.plugin-file
