# executor-remote.stream

- Status: active
- Since: 0.1.0
- Source: HAL-195 (build plan PR 10d, remote run executor); PR 10 plan approved on HAL-9093

The `subscribe` call shall return at once and follow the run through `GET /api/runs/<id>/events?after=<seq>`. It shall deliver each event once and in order, ignoring any event whose `seq` it already delivered, and ends the listener without an error when the host sends `end`. A stream that closes without `end`, a dropped connection, and a host error with status 5xx or 429 count as a break: the client marks the engine connection `lost`, waits (the waits grow up to ten seconds) and asks again with `after` set to the last `seq` it delivered, until it gets through or the caller closes the subscription. When the stream is back the connection is `connected` again; with several streams the connection is `lost` while any of them is down. Anything retrying can't fix (an unknown run, a refused sign-in, an event that isn't valid) ends the listener with an error and is not retried. Closing the subscription stops the request and the retries and never calls `onClose`. A listener that throws is reported through `reportError` and the stream carries on, and so does a connection listener that throws.

Rationale: a phone or a Studio on a flaky connection must not lose or repeat an event, and a view must know that the engine is gone.

## Examples

- Given events 1 to 3 and `end`, then the listener gets 3 events and a clean close.
- Given a stream that breaks after event 2, then the client asks again with `after=2` and the listener gets event 3 once.
- Given a host that answers 404 `run_not_found`, then the listener closes with that error and the client doesn't ask again.
- Given a break, then the connection is `lost`, and `connected` when the next stream starts.
- Given the caller closes the subscription while the client waits to retry, then it never asks again and `onClose` is not called.
