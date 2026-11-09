# kit.checkbox

- Status: active
- Since: 0.1.0
- Source: HAL-1995; base component specs 14 (Checkbox), 23 A1 and 23.5; HAL-1613 (the List's checkbox cell)

The kit's `Checkbox` shall be a native checkbox drawn as a 16px box with a 4px radius, a `border-control` edge on `surface` and the standard focus ring, named by its words next to it or else by its `label`, one of which its type shall require. When checked it shall fill `primary` with an `on-primary` check, and when `indeterminate` it shall show a dash in place of the check and be read as mixed. While the pointer is over the box or over a label round it, its edge shall turn `fg-muted`. On a phone or under a coarse pointer, a checkbox without words shall take taps in a 48px square centred on its box. When the user clicks it, its words or presses Space on it, the kit shall call `onChange` with the new value. An `unavailable` checkbox shall stay focusable and keep its value, at 45% (60% when the user asks for more contrast) with an `fg-disabled` edge (`GrayText` at full strength in forced colours), point `aria-describedby` at its reason, and ignore clicks and Space, so that a mixed box stays mixed. Inside a Field a checkbox with words shall be named by its words alone. Inside a Field with an error it shall take a `danger` edge, `aria-invalid` and the Field's line as its description. In forced colours a checked or mixed box shall fill `Highlight` with a `HighlightText` mark. A checkbox with words shall be at least 48px high on a phone or a touch screen, with the words as part of its target.

## Examples

- Given an unchecked Checkbox "Run on a schedule",
  when the user clicks its words,
  then `onChange` is called with `true`.
- Given a Checkbox with `unavailable={{ reason: "why" }}`,
  when the user presses Space on it,
  then `onChange` isn't called, and it stays focusable and is described by "why".
- Given a Checkbox with `indeterminate`,
  when it renders,
  then it shows a dash and is read as mixed.
- Given a mixed Checkbox with `unavailable`,
  when the user clicks it or presses Space on it,
  then it keeps its value and still shows the dash.
- Given an unchecked Checkbox "Select Sorter" without words, on a touch screen,
  when the user taps 12px from its box,
  then `onChange` is called with `true`.
