# server.session

- Status: active
- Since: 0.1.0
- Source: HAL-9 plan phase 4; build plan on HAL-195 (PR 3)

A session shall be a token of 32 random bytes from `crypto.getRandomValues`, written as 64 hex characters,, sent only in the cookie `__Host-halonic-session` with the attributes `Path=/`, `Secure`, `HttpOnly` and `SameSite=Strict`. The server shall store only the SHA-256 of the token, in the `Coordination` port, with its end time, 30 days after sign-in. A request shall count as signed in only while its cookie names a stored session that has not ended. A route behind the sign-in shall answer 401 with the code `not_signed_in` to a request that isn't. A server with no password shall treat every request as signed in, because the host check lets only loopback names reach it.

Rationale: a stolen copy of the session store must not let anyone sign in, and a script on a page must not be able to read the cookie.

## Examples

- Given a session started at noon, then the cookie works 29 days later and not 31 days later.
- Given the stored value for a session, then it isn't the token and the token can't be worked out from it.
- Given a request that has logged out, then the old cookie answers 401 on `GET /api/session`.
