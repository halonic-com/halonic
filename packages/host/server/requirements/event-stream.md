# server.event-stream

- Status: active
- Since: 0.1.0
- Source: HAL-195 (build plan PR 10b, remote run executor); PR 10 plan approved on HAL-9093

The server shall let a signed-in caller follow a run it already started with `GET /api/runs/<runId>/events?after=<seq>`, which answers `text/event-stream`. Each durable event after `seq` (all of them when `after` is absent) is one message named `run`, whose `data` is the event as one line of JSON and whose `id` is the event's `seq`. New events follow as they are appended. When the run has ended and every event was sent, the server sends one message named `end` and closes the stream; a stream that closes without `end` broke, and the caller asks again with the last `seq` it saw. The route passes the same `Host` and `Origin` checks, sign-in and daily request ceiling as every route, and counts as one request however long it stays open. An `after` that isn't a whole number written in digits answers 400 `bad_request`; a run id that doesn't exist answers 404 `run_not_found` with a fixed message. When the stream breaks on the host's side, the cause goes to the error log and never to the caller. When the caller closes the request, the server closes the subscription. Reading needs no trust, as the summary needs none.

Rationale: a remote client follows a run live and must not lose or repeat an event across a broken connection. Server-sent events resume by id, and a Web-standard `Response` body streams the same on Node and on a Worker.

## Examples

- Given a run with events 1 to 3, when `GET /api/runs/run_1/events` arrives signed in, then three `run` messages with ids 1, 2, 3 and an `end` message come back.
- Given the same run, when the request has `?after=2`, then only event 3 comes back.
- Given a stream that breaks after event 2, then the body ends with no `end` message, and the cause is in the error log only.
- Given `?after=-1`, `?after=1e3` or `?after=x`, then it answers 400 and nothing is subscribed.
- Given no session on a server with a password, then it answers 401 and the executor is never asked.
- Given the caller aborts the request, then the subscription is closed.
