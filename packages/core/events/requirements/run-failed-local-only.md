# events.run-failed-local-only

- Status: active
- Since: 0.1.0
- Source: HAL-5922 (HAL-5921, ADR `docs/adr/2026-11-08-local-first.md`)

The events package shall let a `run.failed` event give the reason `local-only` when the workspace is local only (`privacy.localOnly: true`) and no model the step could use runs on this computer, so the engine called none of them. The run log's `llm.skipped` events with the reason `local-only` name the models it skipped.

## Examples

- Given the reason type,
  when it is listed,
  then it includes `local-only`.
