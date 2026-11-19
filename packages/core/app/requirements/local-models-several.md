# app.local-models-several

- Status: active
- Since: unreleased
- Source: HAL-13430; first-run-flow revision 7, section 3.3 (the model screen's states) and 8d, approved by the board on HAL-7993

When Ollama on this computer answers with two or more downloaded models, the model detection shall give the state `several` with every model's name, in the order Ollama gives them.

## Examples

- Given Ollama answers with `qwen3:8b` and then `llama3.2`,
  then the state is `several`, with `qwen3:8b` first and `llama3.2` second.
