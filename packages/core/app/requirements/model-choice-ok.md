# app.model-choice-ok

- Status: active
- Since: unreleased
- Source: HAL-13431; first-run-flow revision 7, section 3.3 (Pick a model, the error table) and 10.2 R4, approved by the board on HAL-7993

When the test call of a key answers, the outcome shall be `ok`, whatever the answer's form. When the test call of a local model answers with exactly one of the Sorter's labels, with only whitespace around it, the outcome shall be `ok`.

## Examples

- Given a key's model answers `Refund.`,
  then the outcome is `ok`: the key and the account work.
- Given a local model answers ` refund `,
  then the outcome is `ok`.
