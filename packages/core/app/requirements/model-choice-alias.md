# app.model-choice-alias

- Status: active
- Since: unreleased
- Source: HAL-13431; first-run-flow revision 7, section 3.3 (Pick a model, the error table) and 10.2 R4, approved by the board on HAL-7993

When a tested choice is saved, its edits shall point the `default` alias in `models.yaml` at the choice's provider and model, keep the file's comments, and drop the alias's `description`, `params` and `price`, which belonged to the old model. A key choice shall use its provider's model from the first run's provider table; a local choice the model its test passed. An alias that already points there shall give no edit.

## Examples

- Given Acme's `models.yaml` and the key choice for OpenAI,
  then `default` points at `openai`, `gpt-6-luna`, without the test model's description, and the change names `models.yaml`.
- Given the local choice `llama3.2`,
  then `default` points at `ollama`, `llama3.2`.
