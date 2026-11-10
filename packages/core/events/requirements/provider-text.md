# events.provider-text

- Status: active
- Since: 0.1.0
- Source: Liam's decision on HAL-3116 to keep the provider's error text in the run log; task HAL-3119. An added optional field keeps the run log contract

The events package shall let a `run.failed` event and an `llm.fallback` event keep the model provider's own error text in an optional `providerText`: the HTTP `status` it came with, left out when it has none, and the `text`, which the provider already shortened and checked for keys. It is for `--debug` and Copy details only (microcopy 1.4, the cli-output checklist): the run summary shall not take it, and the `error` text stays the message to show. Logs written before the field existed read as before.

## Examples

- Given a `run.failed` event with `reason: "error"` and `providerText: { status: 400, text: "max_tokens is too large" }`,
  when its type is checked,
  then it is a valid run event; the same holds for an `llm.fallback` event.
- Given a `run.failed` or `llm.fallback` event without `providerText`,
  when its type is checked,
  then it is a valid run event.
- Given a run log that ends in a `run.failed` event with `providerText`,
  when it is summarized,
  then the summary's `error` is the event's `error`, and nothing in the summary holds the provider's text.
