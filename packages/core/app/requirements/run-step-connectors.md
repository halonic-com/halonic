# app.run-step-connectors

- Status: active
- Since: unreleased
- Source: HAL-13670 (Nina's C337 note on HAL-14257, row C13: a step whose connector didn't start showed ✓, and the agent never got its tools)

When the run log has a `connector.listing-failed` event (`events.connector-listing-failed`) inside a step, the app shall give that step the connectors that didn't start, each once, in the order they first failed, including a subagent's or a parallel branch's connector. A step where every connector started shall have none.

## Examples

- Given a run whose step Draft a reply logged `connector.listing-failed` for `handbook` at two model turns, then for `tracker`,
  when its steps are read,
  then Draft a reply has the connectors `handbook` and `tracker`, and Read the email has none.
