# app.doctor-default-model

- Status: draft
- Since: unreleased
- Source: HAL-13406; first-run-progress 4.2 (the Default model line), with Noah's additions of revision 3 (Sample answers, Local only), accepted by Liam on HAL-13406

Inside a workspace with a `default` model alias, the doctor's report shall hold a Default model line for Studio's Check this computer: whether `default` uses the built-in test model (Sample answers) or a provider, with the provider's id and name and whether it runs on this computer. While that model can't be used yet, the line shall be marked as failed with a cause id that names the line the cause belongs to: `default-model.local-only` while `privacy.localOnly` is on and the provider is in the cloud, otherwise `models.unreachable` or `models.no-key` from the Models line. Local only shall come first. A Models line that ran over its limit shall name no cause. `halonic doctor` shall not print the line, and it shall not count in the summary.

## Examples

- Given `default` uses the test model,
  then the line is ✓ and says it uses Sample answers.
- Given `default` uses Anthropic, its key isn't stored and Local only is on,
  then the line is ✕ with the cause `default-model.local-only`.
- Given `default` uses Anthropic and its key isn't stored,
  then the line is ✕ with the cause `models.no-key`.
- Given `default` uses Ollama on this computer and Ollama doesn't answer,
  then the line is ✕ with the cause `models.unreachable`.
- Given the workspace has no `default` alias,
  then there is no Default model line.
