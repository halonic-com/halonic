# cli.run-failed-local-only

- Status: active
- Since: 0.1.0
- Source: HAL-5922 (HAL-5921, ADR `docs/adr/2026-11-08-local-first.md`); the lines are those of [cli-output](/HAL/issues/HAL-1981#document-cli-output) 3.4 for a local-only workspace, with the way to turn local-only off from HAL-5962

When a run's log ends with `run.failed` for `local-only`, `halonic run` and `halonic runs show` shall print the local-only failure lines: the workspace's name, the provider of the model the run skipped last (its file's name, or else its id), and that model's agent and alias, from the run log's last `llm.skipped`. A log that names no model shall get the general lines with the engine's message.

## Examples

- Given a run of the workspace Acme whose log skips `smart` at OpenAI for the agent `drafter` and fails for `local-only`,
  when its failure lines are worked out,
  then they name Acme, OpenAI, `drafter` and `smart`.
- Given a `local-only` failure whose log has no model,
  when its failure lines are worked out,
  then they are the general lines with the engine's message.
