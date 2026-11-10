# events.run-failed-out-of-credit

- Status: active
- Since: 0.1.0
- Source: [microcopy](/HAL/issues/HAL-751#document-microcopy) 15.3 and [cli-output](/HAL/issues/HAL-1981#document-cli-output) 3.4, approved by the board; settled for v0.1 in Liam's answer on HAL-555; added with the model adapters that write it on HAL-3008

The events package shall let a `run.failed` event give the reason `out-of-credit` when the account at the model's provider has no credit left or reached its spending limit there, so a person learns to top up that account. It is never the Halonic budget, which is `budget`. The `error` text stays the message to show.

## Examples

- Given the reason type,
  when it is listed,
  then it includes `out-of-credit`.
- Given a `run.failed` event with `reason: "out-of-credit"`,
  when its type is checked,
  then it is a valid run event.
