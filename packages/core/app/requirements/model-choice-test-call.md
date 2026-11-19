# app.model-choice-test-call

- Status: active
- Since: unreleased
- Source: HAL-13431; first-run-flow revision 7, section 3.3 (Pick a model, the error table) and 10.2 R4, approved by the board on HAL-7993

When a model choice is tested, the test call shall ask the choice's model, with no tools and no sampling settings, for the reply Acme's Sorter gives: exactly one of `refund`, `question` or `spam` for a two-line customer email. The time limit to the first answer shall be 5 seconds for a key and 180 seconds for a local model.

## Examples

- Given the key choice for Anthropic,
  then the call asks `claude-haiku-5-5`, and its limit is 5 seconds.
- Given the local choice `llama3.2`,
  then the call asks `llama3.2`, and its limit is 180 seconds.
