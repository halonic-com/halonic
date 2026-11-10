# kit.field-prefix

- Status: active
- Since: 0.1.0
- Source: HAL-3519; base component specs 18.2

When a `Field` has a `prefix` (`{ symbol, name }`, such as `{ symbol: "€", name: "in euros" }`), the kit shall show the symbol in `text-body` `fg-muted` 8px before the control's box, centred on it, hidden from screen readers, and add the `name` to the label as visually hidden text, so the control is read "Per run, in euros". Tapping the symbol shall focus the control. The hint and the error shall still start at the Field's left edge, under the symbol, and the control's focus, error and disabled looks shall be its own. The Field shall never work out the name from the symbol.

## Examples

- Given `<Field label="Per run" prefix={{ symbol: "€", name: "in euros" }}><Input /></Field>`,
  when it renders,
  then "€" is shown before the box and the input is named "Per run, in euros".
- Given the same Field,
  when the user taps "€",
  then the input has focus.
