# app.event-bus

- Status: active
- Since: 0.1.0
- Source: HAL-116

When an event is emitted, the event bus shall call every listener for that event once, in the order they were added. If a listener throws, then the bus shall still call the others. Where the bus has an `onListenerError` handler, as every workspace scope's bus does, it shall pass each error to that handler and not throw; otherwise it shall throw that error, or an `AggregateError` when several threw.

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
- Given an `onListenerError` handler and listeners A (throws) and B,
  when the event is emitted,
  then B is still called, the handler gets A's error and the event name, and `emit` returns normally.
- Given a listener that adds another listener while it runs,
  when the event is emitted,
  then the new listener is called from the next event on.
