# cloudflare-durable.run-events-subscription

- Status: active
- Since: 0.1.0
- Source: HAL-6850; build plan part 11 (HAL-197); `RunExecutor.subscribe` in the port

`DurableRunEvents` shall give the port's `subscribe` over a run object's watch stream: it shall pass each event to the listener once and in order, call `onClose()` with no error when the stream closes, call `onClose(error)` when the stream breaks or the object refuses the watch, call the listener nothing before `subscribe` returns, and free the watcher in the object, without calling the listener again, when the caller closes the subscription.

Rationale: `streamRunEvents` in the host server follows a run through `subscribe`, so the Studio on the Cloudflare target gets the same events and the same ending as against `halonic serve`, and a client that sees a break asks again from its last `seq`.

## Examples

- Given a watch stream with events 2, 3 and 4 and then a normal close,
  when a client subscribes after 1,
  then the listener gets 2, 3 and 4 and then `onClose()` with no error.
- Given a watch stream that breaks after event 1,
  when the listener is told,
  then `onClose` has an error, so the caller subscribes again after 1.
- Given an open subscription,
  when the caller closes it,
  then the watcher is freed and the listener is not called again.
