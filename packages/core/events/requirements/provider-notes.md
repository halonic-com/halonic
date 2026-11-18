# events.provider-notes

- Status: active
- Since: unreleased
- Source: HAL-12285, point 2: say once per run which sampling setting model-anthropic left out and why; task HAL-12287

The events package shall let an `llm.response` event keep, in an optional `notes`, the provider's plain sentences on how it changed that call, such as "Left out temperature: claude-sonnet-5-5 doesn't take it." The field is absent when the provider changed nothing. Logs written before the field existed read as before.

It shall give a `providerNotes(events)` that lists the notes of a run's `llm.response` events, each distinct note once, in the order each first came, so a run that changed every call the same way says so once.

## Examples

- Given an `llm.response` event with `notes: ["Left out temperature: claude-sonnet-5-5 doesn't take it."]`,
  when its type is checked,
  then it is a valid run event.
- Given a run whose three `llm.response` events each have the note "Left out temperature: claude-sonnet-5-5 doesn't take it.", and whose second also has "Left out top_p: claude-sonnet-5-5 doesn't take it.",
  when its provider notes are listed,
  then they are the temperature note, then the top_p note.
- Given a run whose `llm.response` events have no `notes`,
  when its provider notes are listed,
  then the list is empty.
