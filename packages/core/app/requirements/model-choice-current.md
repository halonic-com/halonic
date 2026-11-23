# app.model-choice-current

- Status: active
- Since: unreleased
- Source: HAL-16708 (HAL-14808 PR 4a); HAL-16248 (the Model row shows the current default model the way first-run-flow 3.3 names it)

When asked what the workspace's model is, the model choice shall answer from `models.yaml`'s `default` alias and its provider's file: `{"kind": "sample"}` when the provider's `type` is `mock`, otherwise `{"kind": "provider", "name": <the file's name, or its id without one>, "model": <the alias's model>, "local": <the file's local>}`. When there is no `default` alias, or `models.yaml` or the provider's file is missing or doesn't parse, it shall answer nothing. It shall write nothing.

Rationale: a served window's Settings › Models names the model before Pick a model changes it, and only the computer reads the workspace's files.

## Examples

- Given Acme's `default` on the `mock` provider, then the answer is `{"kind": "sample"}`.
- Given `default` on `ollama`'s `llama3.2` and a provider file with no name and `local: true`, then the answer names `ollama`, `llama3.2` and local.
