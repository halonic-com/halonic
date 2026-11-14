# models.providers.edit

- Status: draft
- Since: 0.1.0
- Source: HAL-10 migration checklist U30 (Now; note: "Can be edited", new: the old provider page is read-only); changed by the save-model decision, HAL-1102 (req-models, HAL-110; flow-models, HAL-177)

When the user changes a provider's name, type, base URL, secret name or local switch on its page, the models feature shall write the change to that provider's file, saved at once and undoable as one step (Ctrl Z), and if the base URL is not a valid URL, then it shall not write it and show the problem. In v0.1 only these fields are editable (HAL-119); other changes go through the raw file editor or the assistant.

## Examples

- Given `providers/ollama.yaml` with no base URL,
  when the user sets the base URL to `http://localhost:11434/v1`,
  then `providers/ollama.yaml` is saved with `baseUrl: http://localhost:11434/v1`.
- Given the user turns "local" off for "Ollama" while the workspace is local only, then the page says "Blocked: this workspace is set to local only." after the change.
- Given the user types `localhost:11434` (no scheme) as base URL, then the file is not changed and the field shows the URL problem.
- Given the user changes the secret name of "Anthropic" from `anthropic` to `anthropic-work`, then `providers/anthropic.yaml` is saved with `secret: anthropic-work` without asking, no stored key changes, and like any important setting it goes live with the next version.
