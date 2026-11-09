# events.tool-call-as-text

- Status: active
- Since: 0.1.0
- Source: [plan-providers](/HAL/issues/HAL-1061#document-plan-providers) for the chat turn's model fallback, approved with changes on HAL-1880; task HAL-1880

The events package shall let an `llm.response` event mark, in an optional `toolCallAsText: true`, an answer that made no tool call but whose text is a call to a tool the step offered, written out as JSON. The mark only records it; that call never runs. The field is absent on every other answer, never `false`. Logs written before the field existed read as before; a missing mark means the answer wasn't marked.

## Examples

- Given an `llm.response` event with `toolCallAsText: true`,
  when its type is checked,
  then it is a valid run event.
- Given an `llm.response` event without `toolCallAsText`,
  when its type is checked,
  then it is a valid run event.
- Given an `llm.response` event with `toolCallAsText: false`,
  when its type is checked,
  then it isn't a valid run event.
