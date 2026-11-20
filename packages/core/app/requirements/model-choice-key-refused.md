# app.model-choice-key-refused

- Status: active
- Since: unreleased
- Source: HAL-13431; first-run-flow revision 7, section 3.3 (Pick a model, the error table) and 10.2 R4, approved by the board on HAL-7993

If the provider doesn't accept the key in the test call, then the outcome shall be `key-refused`.

## Examples

- Given the call fails with the reason `key-refused`,
  then the outcome is `key-refused`.
