# engine.turn-provider-notes

- Status: active
- Since: unreleased
- Source: HAL-12285, point 2: say in the run log which sampling setting model-anthropic left out and why, without failing the run; task HAL-12287

When a provider's answer has `notes` (requirement `ports.provider-notes`), the engine shall keep them, unchanged and in order, on that call's `llm.response`. An answer without notes, or with an empty list, shall leave the field out. The notes shall stay out of the conversation: the assistant message the turn keeps and every later request of the turn shall hold none of them. The run shall go on as it would without them.

## Examples

- Given a turn whose model answers with `notes: ["Left out temperature: claude-sonnet-5-5 doesn't take it."]`,
  when the turn runs,
  then its `llm.response` has those notes, and the turn ends with the answer.
- Given a turn whose model calls a tool with that note, then answers,
  when the turn runs,
  then the second request's messages hold no note.
- Given a turn whose model answers with `notes: []`,
  when the turn runs,
  then its `llm.response` has no `notes`.
