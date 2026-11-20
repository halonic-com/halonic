# kit.field-late-error

- Status: active
- Since: unreleased
- Source: HAL-12535; keyboard and screen-reader check K1 (HAL-12498); WCAG 4.1.3

When a kit `Field` inside a `FieldAnnounceProvider` starts to show an error, or shows a different error, and on the next animation frame focus is not inside the Field, the kit shall call the provider's `announce` once with the Field's label and the error: "Label: error". The kit shall not announce while focus is inside the Field, an error the Field already shows when it mounts, or the same error rendered again. Without a provider, the Field shall announce nothing. The error line itself shall not be a live region, so a form that moves focus to the field with the error has it read once.

## Examples

- Given a Field "Turn limit" inside a `FieldAnnounceProvider`, with focus on the next control,
  when its error becomes "Enter a whole number from 1 to 64.",
  then the provider announces "Turn limit: Enter a whole number from 1 to 64." once.
- Given the same Field with focus on its own control,
  when the error appears,
  then nothing is announced.
- Given the same Field without a provider,
  when the error appears after focus has left it,
  then nothing is announced.
