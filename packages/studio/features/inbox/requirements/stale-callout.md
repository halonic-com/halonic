# inbox.stale-callout

- Status: active
- Since: unreleased
- Source: HAL-18557; design review HAL-18481, improvement 8 (approved by the board on HAL-10)

When a later load of the Inbox fails, the line over the list that says it is showing what the engine said last shall be a callout with **Try again**, which loads the Inbox again, in the same words as before.

## Examples

- Given an Inbox whose last load failed,
  when you press **Try again** and the engine answers,
  then the callout goes and the list is the new one.
