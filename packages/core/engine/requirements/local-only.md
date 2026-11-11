# engine.local-only

- Status: active
- Since: 0.1.0
- Source: HAL-5922 (HAL-5921, ADR `docs/adr/2026-11-08-local-first.md`)

When `LocalExecutorOptions.localOnly` is true, as for a workspace with `privacy.localOnly: true`, the engine shall refuse every model that isn't `local` in Halonic's own loop, and every connector that isn't `local`. Every model of a turn that isn't `local` shall be skipped before any call to it, as a model without its key is: one `llm.skipped` with reason `local-only` and the next model's alias as `next`, or no `next` when none is left, and the same skip in a chat turn's `skipped`. A model that is `local` shall be called as before. When no model is left, the turn shall fail with a `ModelCallError` whose reason is `local-only` and whose message says no model is local, and a run that fails this way shall have the reason `local-only`. The engine shall use only the connectors that are `local`, for the tools it offers and for the connector calls it makes. Without `localOnly`, nothing changes. This doesn't yet cover an agent that runs in a harness program (`runs.harnesses`, a chat turn through `ChatHarnessTurns` or a run step through `runHarnessCall`): such a turn runs as before, whatever its harness sends (HAL-5922).

## Examples

- Given `localOnly`, `smart` on a cloud model falling back to `default` on a local one, when a chat turn runs, then `smart` is never called, `default` answers, and the turn's `skipped` is `smart`, `local-only`, next `default`.
- Given `localOnly` and only a cloud model, when a run's step calls it, then it is never called, the log has an `llm.skipped` with reason `local-only` and no `next`, and the run fails with the reason `local-only`.
- Given `localOnly` and two connectors, one `local` and one not, when a chat turn runs, then only the local connector's tools are offered.
- Given the same cloud model without `localOnly`, when a chat turn runs, then the cloud model answers.
