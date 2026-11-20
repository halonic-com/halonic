# app.model-choice-no-credit

- Status: active
- Since: unreleased
- Source: HAL-13431; first-run-flow revision 7, section 3.3 (Pick a model, the error table) and 10.2 R4, approved by the board on HAL-7993

If the key works but the provider says the account has no credit or is over its limit, then the outcome shall be `no-credit`.

## Examples

- Given the call fails with the reason `out-of-credit`,
  then the outcome is `no-credit`.
