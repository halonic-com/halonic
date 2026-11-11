# engine.local-only

- Status: active
- Since: 0.1.0
- Source: HAL-5922 (HAL-5921, ADR `docs/adr/2026-11-08-local-first.md`); harness agents HAL-6125

When `LocalExecutorOptions.localOnly` is true, as for a workspace with `privacy.localOnly: true`, the engine shall refuse every model that isn't `local` in Halonic's own loop, and every connector that isn't `local`. Every model of a turn that isn't `local` shall be skipped before any call to it, as a model without its key is: one `llm.skipped` with reason `local-only` and the next model's alias as `next`, or no `next` when none is left, and the same skip in a chat turn's `skipped`. A model that is `local` shall be called as before. When no model is left, the turn shall fail with a `ModelCallError` whose reason is `local-only` and whose message says no model is local, and a run that fails this way shall have the reason `local-only`. The engine shall use only the connectors that are `local`, for the tools it offers and for the connector calls it makes. Without `localOnly`, nothing changes. An agent that runs in a harness program (`runs.harnesses`: a chat turn through `ChatHarnessTurns`, or a run step through `runHarnessCall`, whether its file or the run names the harness) shall be refused before its bridge, sandbox or harness starts, because the program sends the work to its own cloud model: the call fails with a `ModelCallError` whose reason is `local-only` and whose message names the agent and its harness, so a chat turn throws it and a run fails with the reason `local-only`.

## Examples

- Given `localOnly`, `smart` on a cloud model falling back to `default` on a local one, when a chat turn runs, then `smart` is never called, `default` answers, and the turn's `skipped` is `smart`, `local-only`, next `default`.
- Given `localOnly` and only a cloud model, when a run's step calls it, then it is never called, the log has an `llm.skipped` with reason `local-only` and no `next`, and the run fails with the reason `local-only`.
- Given `localOnly` and two connectors, one `local` and one not, when a chat turn runs, then only the local connector's tools are offered.
- Given the same cloud model without `localOnly`, when a chat turn runs, then the cloud model answers.
- Given `localOnly` and the agent `writer` with `harness: claude-code`, when a chat turn or a run's step calls it, then no bridge, sandbox or harness starts, the chat turn throws a `ModelCallError` with reason `local-only`, and the run fails with the reason `local-only`.
- Given the same agent without `localOnly`, when a chat turn calls it, then it runs in Claude Code as before.
