# Decision: provider notes on a model call, shown once per run

- Approval: HAL-12287, the follow-up to HAL-12285 point 2; Liam reviews core ports and events
- Kind: internal

model-anthropic leaves `temperature`, `top_p` and `top_k` out of a call to a
model that refuses them (HAL-12285). The person should read once per run
which setting was left out and why, and the run must not fail. Providers
couldn't write to the run log, so this part adds the way for them to; the
adapter fills it in a later part.

- `ports.provider-notes` (new): `ChatResponse` gains an optional `notes`, a
  list of plain sentences in the provider's own words. An added optional
  field keeps `llmProviderVersion` at 1.
- `events.provider-notes` (new): `llm.response` gains an optional `notes`,
  and `providerNotes(events)` lists a run's notes, each once, in the order
  each first came.
- `engine.turn-provider-notes` (new): the engine keeps the notes on the
  call's `llm.response`, out of the conversation.
- `events.run-log-contract`: lists `llm.response.notes` among the fields
  that came with the engine (twenty-six now) and names its requirement.
- `engine.run-log-tools`: `read_run` shows each note once, under the first
  call that had it, with an example.

Why on `llm.response` and not an event of its own: the note belongs to the
call it changed, so every such call keeps it, and readers show it once per
run with `providerNotes`. That needs no state across a run's model calls
(steps, subagents, parallel branches and resumed turns each write their own
turn), and it keeps the event list as it is. A note costs one short
sentence per call.

No test was skipped or loosened.

## Covers

- events.run-log-contract
- engine.run-log-tools
