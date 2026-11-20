# app.model-choice-offline

- Status: active
- Since: unreleased
- Source: HAL-13431; first-run-flow revision 7, section 3.3 (Pick a model, the error table) and 10.2 R4, approved by the board on HAL-7993

If the provider can't be reached in the test call of a key, then the outcome shall be `offline`.

## Examples

- Given the call fails with the reason `offline`,
  then the outcome is `offline`.
