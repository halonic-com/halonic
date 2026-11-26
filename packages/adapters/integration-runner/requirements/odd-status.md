# integration-runner.odd-status

- Status: active
- Since: unreleased
- Source: HAL-19515 (found in the review of PR 6480)

When Halonic answers a request of the runner with a status above 599, the runner shall take the head frame and hand the integration a response that carries that status, as the global `fetch` does, so that the integration sees the HTTP status instead of a protocol failure or a failed request.

## Examples

- Given a request of the runner,
  when Halonic answers it with a head frame with status 600,
  then the integration gets a response with status 600 and `ok` false.
