# events.run-failed-provider-busy

- Status: active
- Since: 0.1.0
- Source: [microcopy](/HAL/issues/HAL-751#document-microcopy) 15.3 and [cli-output](/HAL/issues/HAL-1981#document-cli-output) 3.4, approved by the board; settled for v0.1 in Liam's answer on HAL-555; added with the model adapters that write it on HAL-3008

The events package shall let a `run.failed` event give the reason `provider-busy` when the model's provider was overloaded or asked Halonic to slow down, such as an HTTP 429 that isn't about credit, a 5xx, or Anthropic's 529, so a person learns that nothing they set caused it and that running again may work. The `error` text stays the message to show.

## Examples

- Given the reason type,
  when it is listed,
  then it includes `provider-busy`.
- Given a `run.failed` event with `reason: "provider-busy"`,
  when its type is checked,
  then it is a valid run event.
