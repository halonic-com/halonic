# app.model-choice-local-not-answering

- Status: active
- Since: unreleased
- Source: HAL-13431; first-run-flow revision 7, section 3.3 (Pick a model, the error table) and 10.2 R4, approved by the board on HAL-7993

If the test call of a local model fails for any reason, including the time limit, then the outcome shall be `local-not-answering`.

## Examples

- Given Ollama isn't running, so the call fails with `offline`,
  then the outcome is `local-not-answering`.
- Given the model is still loading at 180 seconds and the call is aborted,
  then the outcome is `local-not-answering`.
