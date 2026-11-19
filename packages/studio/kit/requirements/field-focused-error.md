# kit.field-focused-error

- Status: active
- Since: unreleased
- Source: HAL-13617; keyboard and screen-reader check C196 CL1 (HAL-13598); WCAG 4.1.3 and 3.3.1

When a kit `Field` with `announceWhileFocused` inside a `FieldAnnounceProvider` starts to show an error, or shows a different error, the kit shall call the provider's `announce` once with the Field's label and the error, "Label: error", also while focus is inside the Field. The kit shall not announce an error the Field already shows when it mounts, the same error rendered again (as when focus then leaves the Field), or an error being cleared. A Field without `announceWhileFocused` keeps `kit.field-late-error`.

## Examples

- Given a Field "Turn limit" with `announceWhileFocused` inside a `FieldAnnounceProvider`, with focus on its own control,
  when its error becomes "Enter a whole number from 1 to 64.",
  then the provider announces "Turn limit: Enter a whole number from 1 to 64." once.
- Given the same Field showing that error,
  when focus moves to the next control,
  then nothing more is announced.
- Given the same Field showing that error,
  when the error is cleared,
  then nothing is announced.
