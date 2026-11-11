# events.llm-skipped

- Status: active
- Since: 0.1.0
- Source: [plan-providers](/HAL/issues/HAL-1061#document-plan-providers) for the chat turn's model fallback, approved with changes on HAL-1880; task HAL-1880; `local-only` added on HAL-5922, decision note `decisions/elena/HAL-5922-02-local-only-engine.md`

The run log shall have an `llm.skipped` event, written when a model alias is skipped before any call to it, with the `agent`, the skipped `alias`, its `provider` and `model`, the `reason` and, in an optional `next`, the alias tried instead. The reason is `no-key` when the provider's key isn't set, or `local-only` when the workspace is local only and the provider isn't local. `next` shall be left out when no alias is left to try. The event holds names and codes, never sentences; screens word it, such as "smart: no key, using default". It never holds a key or any part of one. A skipped alias was never called, so the event opens no timeline entry that a later event updates.

## Examples

- Given an `llm.skipped` event with `alias: "smart"`, `reason: "no-key"` and `next: "default"`,
  when its type is checked,
  then it is a valid run event.
- Given an `llm.skipped` event without `next`,
  when its type is checked,
  then it is a valid run event.
- Given the skip reason type,
  when it is listed,
  then it is exactly `no-key` or `local-only`.
