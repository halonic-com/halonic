# kit.field-hint-above

- Status: active
- Since: unreleased
- Source: HAL-13125; Harness page check H3 (HAL-13120)

Where a `Field` has `hintAbove`, the kit's `Field` shall draw its hint, or its error in the hint's place, between the label and the control instead of under the control, with the same look, and the control shall still be described by it. In the side layout, the label shall then line up with that line's text rather than with a control's text line.

## Examples

- Given `<Field label="Harness" hint="What drives this agent" hintAbove>` around a RadioGroup,
  when it renders,
  then the hint sits after the label and before the group, and the group is described by "What drives this agent".
- Given the same Field with `error="Pick a harness."`,
  when it renders,
  then the error sits before the group in the hint's place, and the group is described by it.
