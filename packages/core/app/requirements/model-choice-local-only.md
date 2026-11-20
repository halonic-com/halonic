# app.model-choice-local-only

- Status: active
- Since: unreleased
- Source: HAL-13431; first-run-flow revision 7, section 3.3 (Pick a model, the error table) and 10.2 R4, approved by the board on HAL-7993

When a key choice is saved into a Local only workspace, its edits shall set `privacy.localOnly` to false in `workspace.yaml` and say so. A local choice shall leave Local only as it is.

## Examples

- Given Acme, which is Local only, and the key choice for Anthropic,
  then `workspace.yaml` reads `localOnly: false`, its comments are kept, and the changes include `local-only-off`.
- Given Acme and the local choice `llama3.2`,
  then `workspace.yaml` isn't changed.
