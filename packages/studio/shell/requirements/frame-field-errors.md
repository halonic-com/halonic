# shell.frame-field-errors

- Status: active
- Since: 0.1.0
- Source: HAL-12535; keyboard and screen-reader check K1 (HAL-12498)

The shell's `ShellFrame` shall give every kit Field inside it the window announcer's polite channel through the kit's `FieldAnnounceProvider`, so a Field's error that appears after focus has left the Field is read (`kit.field-late-error`), in the frame's live region or, while a Dialog is open, in the Dialog's.

## Examples

- Given a Field "Turn limit" in the page, with focus elsewhere,
  when its error becomes "Enter a whole number from 1 to 64.",
  then the frame's polite region reads "Turn limit: Enter a whole number from 1 to 64.".
