# kit.dialog-footnote

- Status: active
- Since: 0.1.0
- Source: HAL-7364; plugin screens design 5 and UX checklist 4.3 and 4.4 ("Outside the scroll area, above the buttons")

When a `Dialog` with a footer has a `footnote`, the kit shall draw it as one paragraph in `text-small` and `fg-muted`, padded 24px at the sides and 12px on top, after the body and its alert slot and before the footer, outside the body's scroll area. When the window is shorter than 36em, it shall scroll with the header and the body and stay the last thing above the footer. It shall describe the Dialog, after the body when the body describes it, and on its own in a `form` or `flush` Dialog. In a `form` Dialog on a phone, it shall be the ActionBar's muted note, right above the confirming button. A Dialog without a footer has no footnote.

## Examples

- Given a Dialog "Delete agent?" with a long body and the footnote "This can't be undone.",
  when its body scrolls,
  then the footnote stays between the body and the buttons, and the Dialog is described by the body then the footnote.
- Given a `form` Dialog "New agent" on a phone with the footnote "You can rename it later.",
  when it mounts,
  then the line is in the ActionBar, right above Create agent.
