# app.local-models-none-downloaded

- Status: active
- Since: unreleased
- Source: HAL-13430; first-run-flow revision 7, section 3.3 (the model screen's states) and 8d, approved by the board on HAL-7993

When Ollama on this computer answers with an empty list of downloaded models, the model detection shall give the state `none-downloaded`.

## Examples

- Given Ollama runs and answers with no models,
  then the state is `none-downloaded`, not `not-found`.
