# app.model-choice-provider-file

- Status: active
- Since: unreleased
- Source: HAL-13431; first-run-flow revision 7, section 3.3 (Pick a model, the error table) and 10.2 R4, approved by the board on HAL-7993

When a tested choice is saved and the workspace has no file for its provider, its edits shall add `providers/<id>.yaml` from the first run's provider table, before `models.yaml`, and the key shall be saved under that file's secret name. If the workspace has a file for the provider that the choice can't use (another type, another address for a cloud provider, no secret name, or not local for Ollama), then the edits shall change nothing and say which file stops them.

## Examples

- Given Acme, which has only `providers/mock.yaml`, and the key choice for Gemini,
  then `providers/gemini.yaml` is added, of type `openai-compatible` at Gemini's OpenAI-compatible address, and the key's secret name is `gemini-api-key`.
- Given a workspace whose `providers/anthropic.yaml` names the secret `team-key`,
  then no provider file is added, and the key's secret name is `team-key`.
- Given a workspace whose `providers/openai.yaml` has the type `openai-compatible`,
  then the problem is `provider-differs` in `providers/openai.yaml`.
