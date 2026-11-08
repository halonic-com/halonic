# integration-kit.request-log

- Status: active
- Since: 0.1.0
- Source: HAL-135 (the integration debugger reads only this log)

The kit shall log every request with method, host, path, final status, time and outcome, and nothing else: no query, no headers, no bodies.

## Examples

- Given a request with a query and a placed secret, and a refused request,
  when the log is read,
  then it has one entry each, without the query, the secret or any header.
