# integration-kit.retry-rate-limited

- Status: active
- Since: unreleased
- Source: HAL-19172 (plan section 2.1, PR 1) and HAL-19184

The limited client shall send a `GET` or `HEAD` that gets `429` again, at most twice, after waiting as `retry-after` asks (seconds, or an HTTP date measured against the response's `date`, or the local clock without one), or 1 s then 2 s when it asks nothing readable, and never more than 30 s of waiting in total per request. It shall send any other method once. Each retry shall start again from the request as given, with every check and placement run again, after closing the `429`'s body. Each attempt shall have its own log entry, the retries marked `retry: 1` and `retry: 2`, and the overall timeout shall cover all attempts together.

## Examples

- Given a `GET` that gets `429` with `retry-after: 2`, then `200`,
  when the integration sends it,
  then it gets the `200` after a 2 s wait, and the log has two entries, the second with `retry: 1`.
- Given a `GET` that gets `429` three times,
  when the integration sends it,
  then it gets the third `429` and no fourth request is sent.
- Given a `POST` that gets `429`,
  when the integration sends it,
  then it is sent once.
- Given `retry-after: 31`, or two waits that add up to more than 30 s,
  when the integration sends a `GET`,
  then it gets the `429` without a further retry.
- Given a `GET` redirected to a host that answers `429`,
  when the kit retries it,
  then the retry goes to the original URL and the redirect is checked again.
