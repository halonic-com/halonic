# app.event-bus

- Status: active
- Since: 0.1.0
- Source: HAL-116; plan 4.2

When an event is emitted, the event bus shall call every listener for that event once, in the order they were added. If a listener throws, then the bus shall still call the others and then throw that error, or an `AggregateError` when several threw.

## Examples

- Given listeners A then B for `saved`,
  when `saved` is emitted,
  then A runs before B, each once, with the payload.
- Given a listener that was removed,
  when the event is emitted,
  then it is not called.
- Given listeners A (throws) and B,
  when the event is emitted,
  then B is still called and the error of A is thrown.
- Given a listener that adds another listener while it runs,
  when the event is emitted,
  then the new listener is called from the next event on.
