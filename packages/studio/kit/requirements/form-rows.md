# kit.form-rows

- Status: active
- Since: 0.1.0
- Source: HAL-2977; base component specs 19.2

The kit's `FormRows` shall give every `Field` inside it the side layout, so that a screen never writes `layout="side"`, and a `Field` shall also take that layout from its own `layout="side"`. In the side layout the label shall sit in a 168px column in `text-small`, weight 500 and `fg-muted`, 6px down to a 32px control's text line unless the Field has `align="text"`, and the value shall sit 16px after it, at most 560px wide unless the Field is `wide`, with the hint or the error under the value, still linked to the control with `aria-describedby`. The rows shall have 16px above and below and a 1px `border` line between them, with none above the first. Inside a Card (`inCard`) the label column shall be 120px, the gap 12px, 12px between rows and no lines. Side by side shall hold only while a row is at least 46.5rem wide (28rem inside a Card), through a container query in `rem`; narrower, every Field shall be label over value, as a stacked Field is. An error shall not colour the label or the row.

## Examples

- Given `<FormRows><Field label="Name"><Input /></Field></FormRows>`,
  when it renders,
  then the Field has the side layout without the prop and the label still points at the input.
- Given a Field in FormRows with `align="text"`,
  when it renders,
  then the label isn't moved down.
- Given a Field in FormRows with `error="Give the skill a name."`,
  when it renders,
  then the error sits under the value, the input is described by it and has `aria-invalid`, and the label keeps its colour.
- Given FormRows in a row narrower than 46.5rem,
  when it renders,
  then every Field is label over value.
