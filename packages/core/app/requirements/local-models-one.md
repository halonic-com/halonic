# app.local-models-one

- Status: active
- Since: unreleased
- Source: HAL-13430; first-run-flow revision 7, section 3.3 (the model screen's states) and 8d, approved by the board on HAL-7993

When Ollama on this computer answers with exactly one downloaded model, the model detection shall give the state `one` with that model's name.

## Examples

- Given Ollama answers with `llama3.2` only,
  then the state is `one`, with the model `llama3.2`.
