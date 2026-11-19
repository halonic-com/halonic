# app.local-models-not-found

- Status: active
- Since: unreleased
- Source: HAL-13430; first-run-flow revision 7, section 3.3 (the model screen's states) and 8d, approved by the board on HAL-7993

If Ollama on this computer doesn't answer within the time limit, answers with an error status, or sends what isn't its list of models, then the model detection shall give the state `not-found` with the reason, and shall not throw.

## Examples

- Given nothing answers at Ollama's address,
  then the state is `not-found`, and its cause is the error the source threw.
- Given Ollama answers with a list whose model has no name,
  then the state is `not-found`.
