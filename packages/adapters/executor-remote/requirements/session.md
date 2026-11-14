# executor-remote.session

- Status: active
- Since: 0.1.0
- Source: HAL-195 (build plan PR 10d, remote run executor); PR 10 plan approved on HAL-9093

The client shall sign in to the host with `POST /api/login` when it has a password and a call is answered 401, keep the session cookie it gets in memory, send it on every later call and repeat the refused call once. A session that expired in the middle of a run stream is renewed the same way. Callers that wait on the sign-in at the same time shall share one login. A wrong password, or a host that sends no session, shall reject with a `RemoteHostError` that carries the host's status and code; no error message of the client shall contain the password or the cookie. With no password, a 401 is not retried and surfaces as a `RemoteHostError` with code `not_signed_in`. The client never signs in before it is asked to, so a host with no password sees no login.

The client shall refuse a password with an `http:` base URL whose host is not loopback (`localhost`, `127.0.0.1`, `[::1]`): `createRemoteExecutor` throws a `RangeError` unless the caller sets `allowPlainHttp`. The sign-in request shall time out (30 seconds unless `loginTimeoutMs` says otherwise); the timeout rejects as a try that can be repeated, so a host that stops answering never holds a call forever.

Rationale: `fetch` has no cookie jar outside a browser, so the client keeps the one cookie by hand; and a password or a session token in a log or an error would give the host away.

## Examples

- Given a host that answers 401 until it gets a login, when `send` is called, then the client logs in once, repeats the call with the cookie and returns the summary.
- Given three calls answered 401 at once, then `POST /api/login` is sent once.
- Given the host answers the login with `wrong_password`, then the call rejects with code `wrong_password`, and the message doesn't contain the password.
- Given a password and `http://halonic.example`, then `createRemoteExecutor` throws a `RangeError`; with `allowPlainHttp: true`, or on `http://127.0.0.1`, it doesn't.
- Given a login the host never answers, then the call rejects with a `TimeoutError` after the login timeout.
- Given no password and a 401, then the call rejects with `not_signed_in` and no login is sent.
