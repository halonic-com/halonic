# integration-runner.call-requests-log

- Status: active
- Since: unreleased
- Source: HAL-19185, PR 2 of the HAL-19172 plan, approved by Liam with changes on HAL-19172 (26 Nov): a failed call's cause comes from Halonic's own log of that call, never from what the integration said

When a tool call fails inside the runner, Halonic's side shall put on the `RunnerToolError` it rejects the call with, in `callRequests`, the kit's log entries of the requests that call made while it ran, oldest first: method, host, path, status, refusal and retry, and nothing the runner said. A request belongs to the call its `fetch` frame names, so two calls running at once never get each other's requests. An entry the kit logs after the call ended is dropped. When the call made no request, when one of its requests still waits for its answer (the kit hasn't logged it, so it may still reach the service), or when the secret filter would change the method, host or path of any of them, the error shall carry none.

## Examples

- Given a call whose integration gets `429` from `api.example.com` and then fails,
  when the call ends,
  then its error's `callRequests` holds that `GET` with `status: 429`.
- Given two calls running at once, one refused with `403` and one with `429`,
  when both fail,
  then each error holds only its own request.
- Given a call whose `GET` got `429` and whose `POST` still waits for its answer,
  when the call fails,
  then its error has no `callRequests`.
- Given a call whose request's reply holds a canary and whose request carries a placed secret,
  when it fails,
  then neither appears in `callRequests`.
