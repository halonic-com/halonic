# kit.field-error-border

- Status: active
- Since: unreleased
- Source: HAL-12240; phase B build plan decision 18 (HAL-12232); visual pass HAL-12222 (a field with an error: a `danger` edge and the reason below)

While a `Field` shows an error, the kit's Input or TextArea inside it shall draw its box with a `danger` edge and the danger focus ring, and lose it again when the error is gone.

## Examples

- Given an Input in a Field with the error "That code doesn't match. 4 tries left.",
  when it renders,
  then the Input's box has a `danger` edge and the error line is under it.
- Given that Field with the error cleared,
  when it renders again,
  then the box has its `border-control` edge.
