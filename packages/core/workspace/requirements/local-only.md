# workspace.local-only

- Status: active
- Since: 0.1.0
- Source: HAL-5922 (HAL-5921, ADR `docs/adr/2026-11-08-local-first.md`)

When `loadWorkspace` has parsed a workspace whose `workspace.yaml` sets `privacy.localOnly: true`, the workspace package shall report as an error, with the file, key path and line, every model alias in `models.yaml` or a `hub.yaml` whose provider isn't local, every `provider/model` setting (the workspace's and a hub's default model, the session AI's model, an agent's model and its methods') whose provider isn't local, and every connector that isn't local. A provider is local when its file sets `local: true` or its type is `mock`; a connector is local as `connectorIsLocal` says. Each message names what was refused and ends with how to turn local-only off: `privacy.localOnly: false` in `workspace.yaml`. A provider that no file has is left to the reference checks, and a workspace without `privacy.localOnly: true` gets none of these errors.

## Examples

- Given `privacy.localOnly: true` and `models.yaml` pointing `smart` at the provider `anthropic` without `local: true`, when it is loaded, then `models.yaml` has the error `Alias "smart" uses provider "anthropic", which isn't local, and the workspace is local only: point it at a local provider, or set privacy.localOnly: false in workspace.yaml` at `aliases.smart.provider`.
- Given the same workspace with `privacy.localOnly: false`, when it is loaded, then it has no errors.
- Given `privacy.localOnly: true`, an agent with `model: anthropic/claude-opus-5-5` and a connector at `https://tracker.example.com`, when it is loaded, then both files have an error, the connector's at `transport`.
- Given `privacy.localOnly: true` with the mock model, an Ollama provider with `local: true`, a `stdio` connector and one at `http://127.0.0.1:3000`, when it is loaded, then it has no errors.
