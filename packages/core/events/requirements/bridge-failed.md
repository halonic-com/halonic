# events.bridge-failed

- Status: active
- Since: unreleased
- Source: HAL-11272, finding F2.6 of HAL-11247; plan approved by the CTO on HAL-11313

The run log shall have a `bridge.failed` event for a request of an agent's program to the harness bridge that failed for a reason the bridge didn't name to the program, with the `agent` the bridge serves, the error kind of `@halonicjs/std` in `kind`, and the error's text in `message`, which never holds the run token. The event shall have no cost or token use, so it never counts towards a budget.

## Examples

- Given the event types of the run log,
  when they are listed,
  then `bridge.failed` is among them, with `agent`, `kind` and `message`.
- Given a `bridge.failed` event,
  when its fields are listed,
  then it has no `cost` and no `usage`.
- Given a run log written before `bridge.failed` existed,
  when it is read,
  then it reads as before.
