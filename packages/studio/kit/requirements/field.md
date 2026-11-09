# kit.field

- Status: active
- Since: 0.1.0
- Source: HAL-1289; base component specs 2 and 0.1

The kit's `Field` shall render a label above its control that points at the control's `id`, and under the control either its error, with the alert icon, or else its hint. The Field shall give the control inside it its `id`, `aria-describedby` pointing at that line, `aria-invalid` while there is an error and `aria-required` when it is required, so that a screen never writes them itself. When a Field is `required`, the kit shall write the word "Required" after the label. An empty error or hint (`""`, `null` or `false`) shall count as none.

## Examples

- Given `<Field label="Name" hint="Shown in the sidebar."><Input /></Field>`,
  when it renders,
  then the label's `for` is the input's `id` and the input is described by the hint.
- Given the same Field with `error="Give the agent a name."`,
  when it renders,
  then the hint is gone, the error line shows the alert icon and the sentence, and the input has `aria-invalid="true"` and is described by the error line.
- Given the same Field with `error=""`,
  when it renders,
  then the hint shows and the input has no `aria-invalid`.
