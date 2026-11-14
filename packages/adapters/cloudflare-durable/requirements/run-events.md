# cloudflare-durable.run-events

- Status: active
- Since: 0.1.0
- Source: HAL-6850; build plan part 11 (HAL-197); design review HAL-6790 (Elena, 12 Nov); `RunExecutor.subscribe` in the port

The Cloudflare run object shall let a client watch its run: a stream that first gives the stored events after the `seq` the client names, then each event as it is stored, in order, each once and without a gap, however the watch and an append interleave. It shall close the stream normally after the event that ends the run, and error it when it breaks, so a client that has no ending knows to ask again from its last `seq`. It shall refuse a watch of a run with no events, and a watch beyond a fixed number of watchers (32), and it shall error a stream whose reader has fallen too far behind, rather than hold its events without limit.

Rationale: the Studio on the Cloudflare target follows a run live, and must resume after a dropped connection, a deploy or an object restart exactly as it does against `halonic serve`.

## Examples

- Given a log with events 1 to 3,
  when a client watches after 1 and event 4 is appended,
  then it receives events 2, 3 and 4, in that order.
- Given an open watch,
  when the run's ending event is appended,
  then the client receives it and the stream closes without an error.
- Given a watch that broke after event 5,
  when the client watches again after 5,
  then it receives event 6 onward and never event 5 again.
- Given a log that is empty,
  when a client watches,
  then the object refuses.
