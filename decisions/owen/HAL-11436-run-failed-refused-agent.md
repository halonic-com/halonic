# Decision: run.failed names the agent a sandbox check refused

- Approval: Paperclip task HAL-11436 (follow-up from the review of #3269 on HAL-11431); Liam approves this note in review
- Kind: internal

When the sandbox was not ready, `run.failed` did not say which agent was refused, so the run page guessed from the last top-level `agent.started`. In a parallel state that can name the wrong agent. `run.failed` now carries the refused agent for `sandbox-not-ready`, the same way it does for `instructions-not-trusted`.

- The field is optional, so older logs still parse.
- The run page keeps its guess as a fallback for those older runs.

## Covers

- engine.run-failure-reason-of
- events.run-failed-sandbox-not-ready
