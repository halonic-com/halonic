# ports.connector-call-requests

- Status: active
- Since: unreleased
- Source: HAL-19185, PR 2 of the HAL-19172 plan, approved by Liam with changes on HAL-19172 (26 Nov)

The ports package shall give a `connectorCallRequestsOf(value)` reader that gives the requests of the tool call a connector's error belongs to, oldest first, from the `callRequests` field of an `Error`, the error itself or one in its `cause`, at most 8 deep. Each request shall keep only `method`, `host` and `path` (strings), and `status`, `refusal` and `retry` when they are there (a whole number, a string, a whole number). It shall read the field without `instanceof`, so the engine needs no adapter. It shall return `undefined` when no error has the field, or when the field isn't a list or any entry in it has a field of the wrong type, and shall keep at most the newest 200 entries.

## Examples

- Given an `Error` whose `callRequests` holds a `GET` to `api.example.com` that got `429`,
  when it is read,
  then it gives that one request.
- Given an `Error` whose `cause` has the `callRequests`,
  when it is read,
  then it gives the cause's requests.
- Given a `callRequests` entry whose `status` is a string,
  when it is read,
  then it gives `undefined`.
- Given an entry with an extra field such as `body`,
  when it is read,
  then the field isn't kept.
