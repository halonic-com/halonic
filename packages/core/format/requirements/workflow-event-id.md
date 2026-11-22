# format.workflow-event-id

- Status: active
- Since: unreleased
- Source: HAL-16336

When `parseFile` reads a workflow file, the format shall refuse a transition's `event` that isn't an id (lowercase letters, digits, `-` and `_`, starting with a letter or digit), at the event, with the id rule's message, since a person types the event after `halonic runs send`.

## Examples

- Given a transition with `event: approve now`, when it is parsed, then it fails at `states.<state>.on.<n>.event` with `use lowercase letters, digits, '-' or '_', starting with a letter or digit`.
- Given a transition with `event: needs_changes`, when it is parsed, then the event is kept as it is.
