# runtime.serve-run-events

- Status: active
- Since: 0.1.0
- Source: HAL-6850; build plan part 11 (HAL-197); `streamRunEvents` in `host/server`

The Worker shall stream the events of a run in a run object through `GET /api/runs/<id>/events` as `host/server` frames them for `halonic serve`: each event after `after` (or `Last-Event-ID`) as a `run` message with its `seq` as the id, the events appended while the stream is open after them, and an `end` message when the run's ending event was sent. The route needs a session like every other API route, and a run nobody stored shall answer 404.

Rationale: the Studio on the Cloudflare target gets the same bytes as against `halonic serve`, and a client that reconnects with its last `seq` gets no gap and no repeat.

## Examples

- Given a stored run with events 1 and 2 and a signed-in client, when the client asks for its events and events 3 and 4 (the ending one) are appended meanwhile, then the messages are ids 1, 2, 3, 4 and `end`.
- Given a stored run with events 1 to 3 (3 ends it), when the client asks with `after=2`, then the messages are id 3 and `end`.
- Given a run nobody stored, when a signed-in client asks for its events, then the answer is 404.
