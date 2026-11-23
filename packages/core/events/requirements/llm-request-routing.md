# events.llm-request-routing

- Status: active
- Since: unreleased
- Source: HAL-16834 (PR 1 of the OpenCode harness plan, HAL-16826: the bridge sends the alias's OpenRouter host pin, and the run log shows it, so a trial can check it ran pinned)

The events package shall let an `llm.request` event keep, in an optional `routing`, the OpenRouter `provider` routing the harness bridge sent with that model call: only the keys `order`, `only`, `ignore` and `quantizations` (lists of text), `allow_fallbacks` and `zdr` (true or false) and `data_collection` (`allow` or `deny`). The field is absent when the bridge sent no routing, and in logs written before the field existed, which read as before.

## Examples

- Given an `llm.request` event with `routing: { order: ["deepinfra/fp8"], allow_fallbacks: false, data_collection: "deny" }`,
  when its type is checked,
  then it is a valid run event.
- Given a routing with the key `sort`, or `data_collection: "some"`,
  when its type is checked,
  then it is refused.
- Given an `llm.request` event without `routing`,
  when its type is checked,
  then it is a valid run event, as before.
