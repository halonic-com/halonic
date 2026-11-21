# kit.input-error-outside

- Status: active
- Since: unreleased
- Source: HAL-15443; flow check C575 finding 6 (HAL-15433): Pick a model shows a refused key's message in a Callout inside the option, not as the Field's error line

When a screen marks the kit's `Input` `invalid`, because its error is shown outside the Field and named in `describedBy`, the Input shall set `aria-invalid` on its text and draw its box with the `danger` edge, as for the Field's own error, without drawing an error line under it. An error in the Field shall still make the Input invalid when the screen doesn't.

## Examples

- Given an `Input` in a Field without an error, with `invalid` and `describedBy` naming a Callout,
  when it renders,
  then its text has `aria-invalid="true"` and is described by the Callout, its box has the `danger` edge, and the Field draws no error line.
- Given that `Input` with `invalid` false,
  when it renders again,
  then its text has no `aria-invalid` and its box has its `border-control` edge.
