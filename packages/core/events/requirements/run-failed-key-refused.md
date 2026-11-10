# events.run-failed-key-refused

- Status: active
- Since: 0.1.0
- Source: [microcopy](/HAL/issues/HAL-751#document-microcopy) 15.3 and [cli-output](/HAL/issues/HAL-1981#document-cli-output) 3.4, approved by the board; settled for v0.1 in Liam's answer on HAL-555; added with the model adapters that write it on HAL-3008

The events package shall let a `run.failed` event give the reason `key-refused` when the model's provider didn't accept the key it was sent (HTTP 401 or 403), and when no key was stored for any model the step could use, so a person learns to replace the key, or to add one when none was stored, not to retry. A reader tells the two apart by the run log's `llm.skipped` events with the reason `no-key`. The `error` text stays the message to show; the provider's own text goes to the log, not into the event.

## Examples

- Given the reason type,
  when it is listed,
  then it includes `key-refused`.
- Given a `run.failed` event with `reason: "key-refused"`,
  when its type is checked,
  then it is a valid run event.
