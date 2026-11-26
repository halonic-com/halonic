# http-node.odd-status

- Status: active
- Since: unreleased
- Source: HAL-19515 (found in the review of HAL-19418)

When a server answers with a status outside 200–599 or with a reason phrase a Web `Response` can't hold, the Node transport shall still answer with a `Response` that carries the server's status, as the global `fetch` does, and shall leave out a reason phrase that isn't valid, so that callers see the HTTP status instead of a network failure.

## Examples

- Given a server that answers `HTTP/1.1 600 Busy`,
  when the request is sent,
  then the response has status 600 and `ok` false.
- Given a server that answers `HTTP/1.1 503` with a control character in the reason phrase,
  when the request is sent,
  then the response has status 503 and an empty status text.
- Given a server that answers `HTTP/1.1 503` with a valid reason phrase, Latin-1 included (`Busy é`),
  when the request is sent,
  then the response keeps the status text `Busy é`.
