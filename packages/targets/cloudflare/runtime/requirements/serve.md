# runtime.serve

- Status: active
- Since: 0.1.0
- Source: HAL-9486 (part 9b of HAL-197); secure-serve rules of HAL-195; decided on HAL-9480

The Worker's `fetch()` shall answer `/health` and, for a deployment that set its token, `/self-test` itself, and shall hand every other request to `host/server`'s handler with the Cloudflare adapters. The handler's rules apply unchanged: the `Host` check, the `Origin` check, the sign-in with the length-limited password check, the daily request ceiling and the same neutral 404 for every unknown path.

The names the API answers to shall be the plain variable `HALONIC_ALLOWED_HOSTS` (comma separated). A request whose `Host` isn't listed, such as a preview address, shall get 421 `host_not_allowed` and no API. The deployment's id (`HALONIC_DEPLOYMENT_ID`) is a second plain variable, and `HALONIC_DAILY_REQUESTS` an optional third that sets `limits.dailyRequests`. The client's address shall come from `CF-Connecting-IP` only, and every request counts as HTTPS.

A deployment that lacks a binding, a secret or one of the two required variables (or has a daily ceiling that isn't a whole number above zero) shall answer every request but `/health` with 503 and a fixed body that names nothing. The names of what is missing go to the Worker's log only, never a value.

The workspace is trusted, because the deployer uploaded it. No routine is found for a webhook and no run is started yet: starting a run answers 501, and a webhook answers as an unknown address.

## Examples

- Given a complete deployment, when `GET /api/hello` has `Host` of a listed name, then it is 200 with the three `hello` keys.
- Given the same request with the Worker's preview address as `Host`, then it is 421 `host_not_allowed`.
- Given `GET /api/unknown`, then it is the same 404 body as `/health/` gets.
- Given `HALONIC_ALLOWED_HOSTS` is not set, then `GET /api/hello` is 503 with no variable name in the body, and `GET /health` is still 200.
- Given `HALONIC_DAILY_REQUESTS` of 2, when a third request arrives on the same day, then it is 429 `daily_limit_reached`.
- Given the right password for the configured hash, `POST /api/login` is 200 with a session cookie; given a wrong one it is 401.
