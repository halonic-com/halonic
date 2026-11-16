# runtime.serve

- Status: active
- Since: 0.1.0
- Source: HAL-9486 (part 9b of HAL-197); secure-serve rules of HAL-195; decided on HAL-9480

The Worker's `fetch()` shall answer `/health` and, for a deployment that set its token, `/self-test` itself, and shall hand every other request to `host/server`'s handler with the Cloudflare adapters. The handler's rules apply unchanged: the `Host` check, the `Origin` check, the sign-in with the length-limited password check, the daily request ceiling and the same neutral 404 for every unknown path.

The names the API answers to shall be the plain variable `HALONIC_ALLOWED_HOSTS` (comma separated). A request whose `Host` isn't listed, such as a preview address, shall get 421 `host_not_allowed` and no API. The deployment's id (`HALONIC_DEPLOYMENT_ID`) is a second plain variable, and `HALONIC_DAILY_REQUESTS` an optional third that sets `limits.dailyRequests`. The client's address shall come from `CF-Connecting-IP` only, and the scheme shall be the one of the request URL, so a plain-http request gets no `Secure` cookie.

A deployment that lacks a binding, a secret or one of the two required variables (or has a daily ceiling that isn't a whole number above zero) shall answer every request but `/health` with 503 and a fixed body that names nothing. The names of what is missing go to the Worker's log only, never a value.

The Worker's provider keys shall be its Workers secrets, set at deploy time. `GET /api/secrets/<name>` shall say whether one is set and never its value. `PUT` and `DELETE` shall pass the same checks as on any host (plain http to a non-loopback name is 403 `secure_connection_required`), then answer 409 `keys_read_only` with a message that names no secret: a Worker can't change its own secrets.

The workspace is trusted, because the deployer uploaded it. A webhook finds its routine in the snapshot the deployer uploaded: the snapshot's version is read at every delivery, and its routines are parsed again when the version changes, and the checks of `host/server` apply unchanged: the signature, the time window, the replay refusal, and one neutral answer for an unknown address, a routine that is off and a bad signature. No run is started by the Worker yet: starting a run answers 501, so a signed delivery for a routine answers 501 too, and its delivery id is not used up.

## Examples

- Given a complete deployment, when `GET /api/hello` has `Host` of a listed name, then it is 200 with the three `hello` keys.
- Given the same request with the Worker's preview address as `Host`, then it is 421 `host_not_allowed`.
- Given a routine with a webhook trigger in the snapshot and an executor that starts runs, when a delivery signed with its secret arrives, then it is 202 with the run id; the same delivery again is 409, and one with a wrong signature or for an address with no routine is the same 401.
- Given `GET /api/unknown`, then it is the same 404 body as `/health/` gets.
- Given `HALONIC_ALLOWED_HOSTS` is not set, then `GET /api/hello` is 503 with no variable name in the body, and `GET /health` is still 200.
- Given `HALONIC_DAILY_REQUESTS` of 2, when a third request arrives on the same day, then it is 429 `daily_limit_reached`.
- Given the right password for the configured hash, when it is posted to `/api/login`, then the answer is 200 with a session cookie; given a wrong one, then it is 401.
- Given a signed-in `PUT /api/secrets/<name>` over plain http, then it is 403 `secure_connection_required`; over HTTPS it is 409 `keys_read_only` and the key is unchanged.
- Given a key set as a Workers secret, when `GET /api/secrets/<name>` is asked, then it is `{"stored":true}` and no response, log line or error holds the value.
