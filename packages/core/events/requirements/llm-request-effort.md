# events.llm-request-effort

- Status: active
- Since: unreleased
- Source: HAL-16735 (per-model effort for harness runs, D38 on HAL-16520)

The events package shall let an `llm.request` event keep, in an optional `effort`, the effort the harness bridge set on that model call in place of the program's own: `low`, `medium` or `high`. The field is absent when the bridge left the program's effort as it was, and in logs written before the field existed, which read as before.

## Examples

- Given an `llm.request` event with `effort: "low"`,
  when its type is checked,
  then it is a valid run event.
- Given an `llm.request` event without `effort`,
  when its type is checked,
  then it is a valid run event, as before.
