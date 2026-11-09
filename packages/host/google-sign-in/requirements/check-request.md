# google-sign-in.check-request

- Status: active
- Since: 0.1.0
- Source: HAL-708 (build plan B3, plan D6; HAL-1056)

When a sign-in starts, it shall refuse with a `RangeError`, before keeping a pending sign-in, any `googleCheck` URL whose parsed form isn't `https:` on `googleapis.com` or a host ending in `.googleapis.com`, or that has a user name, a password or a port other than the default. Each check shall be a `GET` without a body, with only the `Authorization: Bearer` and `Accept` headers, with redirects refused and a 10-second limit. The access token shall go nowhere else: not into a request URL, a form body, a result or the console, also when a check's answer echoes it.

## Examples

- Given a check URL `https://googleapis.com.example.com/v1/me`, `https://x@evil.example/`, `http://gmail.googleapis.com/v1/me` or `https://gmail.googleapis.com:8443/v1/me`,
  then starting the sign-in throws `RangeError` and nothing goes to Google.
- Given a check URL `https://gmail.googleapis.com:443/v1/me`, then the check goes to `https://gmail.googleapis.com/v1/me`.
- Given a check answer whose message holds the access token, then the result doesn't.
