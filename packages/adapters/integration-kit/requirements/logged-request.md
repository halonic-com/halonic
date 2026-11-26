# integration-kit.logged-request

- Status: active
- Since: unreleased
- Source: HAL-19185, PR 2 of the HAL-19172 plan, approved by Liam with changes on HAL-19172 (26 Nov): a failed call's cause comes from the log entries of that call

The kit's client shall take an optional `onLogged` with a request, and shall give it the request's log entry right after the log takes it, the same entry and nothing more, whether the request was answered, refused or failed. A request without it shall be logged as before, and the transport shall never see it.

## Examples

- Given a request with `onLogged` that gets `429`,
  when it ends,
  then `onLogged` hears the entry the log took, with `status: 429`.
- Given a request with `onLogged` to a host the sheet doesn't declare,
  when the kit refuses it,
  then `onLogged` hears the entry with `refusal: "host-not-allowed"`.
