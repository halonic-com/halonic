# cloudflare-live.transient

- Status: active
- Since: unreleased
- Source: HAL-17662; multi-cloud ADR 5.9

The live suite's calls to the Cloudflare API shall be sent again when Cloudflare answers 429 or any 5xx, or the connection fails, up to 4 tries in all, waiting 2, 4 and then 8 seconds (or a 429's `Retry-After`, at most 30 seconds). A request whose own time ran out shall not be sent again, and the last answer shall be returned as it came. Any other answer shall be returned at once. Each try that is asked again shall be logged with its method, path and status, with the account id left out. A contract case that failed only with Cloudflare's own "internal error; reference = …", or whose call got the edge's "Script not found" page instead of the Worker, shall run again, up to 3 runs in all; any other failure, and the last run's, shall count as it came. The adapter suite's teardown shall have 5 minutes.

Rationale: in the merge queue a single Cloudflare hiccup (an HTTP 500 "please try again", an internal error inside the Worker's call to D1 or a Durable Object, the edge briefly losing the Worker, or a slow teardown) failed the whole group and cancelled every group behind it. Asking again a few times keeps a real failure, which fails every try, while one hiccup no longer does.

## Examples

- Given `POST /accounts/a/r2/buckets` answered 500 and then 200, then the client gets the 200 and the log names `/accounts/<account>/r2/buckets` and the 500.
- Given a 403, then it is returned at once and nothing is sent again.
- Given four 503 answers, then the fourth is returned.
- Given a case that fails with "internal error; reference = abc" and then passes, then the test passes.
- Given a case whose call gets a 500 page titled "Script not found" and then passes, then the test passes.
- Given a case that fails with "expected 2, got 1", then it runs once and fails.
