# app.model-choice-local-not-usable

- Status: active
- Since: unreleased
- Source: HAL-13431; first-run-flow revision 7, section 3.3 (Pick a model, the error table) and 10.2 R4, approved by the board on HAL-7993

If a local model answers the test call with anything but exactly one of the Sorter's labels, or with a tool call, then the outcome shall be `local-not-usable`.

## Examples

- Given a local model answers `I think this is a refund request.`,
  then the outcome is `local-not-usable`.
