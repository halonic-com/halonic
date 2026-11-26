# app.integration-request-log

- Status: active
- Since: unreleased
- Source: HAL-19169 (I7 PR 2, HAL-18391 plan section 2.2, Liam's answers on HAL-18391): the local request log the integration debugger reads; HAL-19284 (Julian's bounds from HAL-19170)

The app shall keep each local integration's requests and failed calls in `integration-logs/<workspace key>/<integration id>.jsonl` in the profile, never in a workspace, in a file only the person may read (mode `0600`). It shall keep the last 200 requests and the last 200 failure notes; a note holds only the tool, the error kind and the field names of a changed reply. It shall mask each path segment the integration's code doesn't hold when the entry is written, as `{…}`, comparing against the code as it is then, and keep a segment of digits only when the code holds it as a route segment. It shall store a method that isn't an HTTP method token, and a host that isn't a plain host name or a bracketed IP address with an optional port, as `{…}`. While a file is being written, at most 200 requests and 200 failure notes shall wait for it, the oldest dropped first, and what waits shall go in one write with one read of the code. It shall skip a code file over 1 MB, or past 4 MB of code in all, when masking, and look at only the first 64 segments of a path. Removing the integration shall drop what waits and delete its log, and forgetting the workspace shall drop what waits, wait for a running write and delete the workspace's whole folder of logs.

## Examples

- Given an integration whose code calls `` `/v2/orders/${id}/customers/${email}` ``,
  when it requests `/v2/orders/1001/customers/x@example.com`,
  then the log keeps `/v2/orders/{…}/customers/{…}`.
- Given an entry written before the code adds `1001` as a route segment,
  when the log is read afterwards,
  then the entry still has `{…}`.
- Given a request whose host is `a"b.example`,
  when the log is written,
  then its host is stored as `{…}`.
- Given a request with a placed secret and a reply body,
  when the log is written,
  then the file holds neither.
- Given a runner that makes 10,000 refused requests while the log is being written,
  when the write ends,
  then at most 200 of them waited, and the code was read once for the next write.
