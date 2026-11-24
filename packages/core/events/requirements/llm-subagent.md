# events.llm-subagent

- Status: active
- Since: unreleased
- Source: HAL-17263 (token metric 7 on HAL-16892, field agreed with phase 1e on HAL-17254)

The events package shall let an `llm.request` event and its `llm.response` keep, in an optional `subagent`, a label saying that a sub-agent of the program, not the agent itself, made that model call. The field never holds an id. It is absent for the agent's own calls, for calls whose maker is unknown, and in logs written before the field existed, which read as before.

## Examples

- Given an `llm.request` or `llm.response` event with `subagent: "subagent"`,
  when its type is checked,
  then it is a valid run event.
- Given an `llm.request` event without `subagent`,
  when its type is checked,
  then it is a valid run event, as before.
