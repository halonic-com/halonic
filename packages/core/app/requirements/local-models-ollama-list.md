# app.local-models-ollama-list

- Status: active
- Since: unreleased
- Source: HAL-13430; first-run-flow revision 7, section 3.3 (the model screen's states) and 8d, approved by the board on HAL-7993

When the model detection reads Ollama's answer to `GET /api/tags`, it shall take the `name` of each entry in its `models` list, in that order, without a `:latest` tag, so each name is the one `ollama pull` takes. If the answer has no `models` list, or an entry has no name, then it shall throw.

## Examples

- Given the answer lists `llama3.2:latest` and `qwen3:8b`,
  then the names are `llama3.2` and `qwen3:8b`.
- Given the answer is `{ "error": "…" }`,
  then reading it throws.
- Given an entry without a `name`,
  then reading it throws.
