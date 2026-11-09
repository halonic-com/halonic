# google-sign-in.check-request

- Status: active
- Since: 0.1.0
- Source: HAL-708 (build plan B3, plan D6; HAL-1056, HAL-1226, HAL-1351)

When a sign-in starts, it shall refuse with a `RangeError`, before keeping a pending sign-in, any `googleCheck` URL whose parsed form isn't `https:` on one of the service's own API hosts (its `googleApis` entries of the form `<name>.googleapis.com`, other than `storage.googleapis.com` and `www.googleapis.com`) or on `www.googleapis.com` with a path whose first segment is the `<name>` of one of them, or that has a user name, a password or a port other than the default. Each check shall be a `GET` without a body, with only the `Authorization: Bearer` and `Accept` headers, with redirects refused and a 10-second limit. The access token shall go nowhere else: not into a request URL, a form body, a result or the console, also when a check's answer echoes it.

## Examples

- Given a check URL `https://gmail.googleapis.com.example.com/v1/me`, `https://x@evil.example/`, `http://gmail.googleapis.com/v1/me`, `https://gmail.googleapis.com:8443/v1/me`, `https://storage.googleapis.com/some-bucket/me`, another service's API host, or `https://www.googleapis.com/storage/v1/b/some-bucket/o/me` for Gmail,
  then starting the sign-in throws `RangeError` and nothing goes to Google.
- Given a service that lists `evil.example.com`, `googleapis.com`, `storage.googleapis.com` or `www.googleapis.com` and has its check on that host,
  then starting the sign-in throws `RangeError` and nothing goes to Google.
- Given a check URL `https://gmail.googleapis.com:443/v1/me` for a service that lists `gmail.googleapis.com`, then the check goes to `https://gmail.googleapis.com/v1/me`.
- Given Drive's check URL `https://www.googleapis.com/drive/v3/about` for a service that lists `drive.googleapis.com`, then the check goes there.
- Given any check, then it may take 10 seconds before it counts as unreachable.
- Given a check answer whose message holds the access token, then the result doesn't.
