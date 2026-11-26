# integration-kit.odd-status

- Status: active
- Since: unreleased
- Source: HAL-19515 (found in the review of PR 6480)

When the transport answers an integration's request with a status outside 200–599, or with a reason phrase a Web `Response` can't hold, the kit shall still hand the integration a response that carries the server's status, as the global `fetch` does, and shall leave out a reason phrase that isn't valid, so that the integration sees the HTTP status instead of a failed request.

## Examples

- Given a transport that answers with status 600,
  when the kit guards the response,
  then the integration gets status 600 and `ok` false.
- Given a transport that answers 503 with a control character in the reason phrase,
  when the kit guards the response,
  then the integration gets status 503 and an empty status text.
