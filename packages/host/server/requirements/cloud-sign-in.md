# server.cloud-sign-in

- Status: active
- Since: unreleased
- Source: HAL-13551 (selling layer S2-18), plan approved on the task; Cloud's `control-plane.signin-routes` and `control-plane.app-session-routes`

When a many-user server has Cloud sign-in, `GET /api/sign-in` shall send the browser with a 303 to Cloud's sign-in page, `/` on the sign-in origin from the deployment's config, with the product id, the place `app`, the return path `/api/sign-in/return` and a new `state` of 32 random bytes in base64url, and shall keep that `state` in the cookie `__Host-halonic-sign-in-state` with `Path=/`, `Secure`, `HttpOnly`, `SameSite=Lax`, no `Domain` and a `Max-Age` of 600 seconds. The return path and the page after sign-in, `/`, shall be fixed, never taken from a request. `GET /api/sign-in/return` shall exchange the address's `code` only when the address's `state` and exactly one state cookie are both present and equal, compared in constant time, and shall call the exchange at most once, with no retry. Without a code and a matching `state`, after a refusal and after an exchange that fails, the return shall start over as `GET /api/sign-in` does, with a new `state` that replaces the old one, so a `state` works once. A refusal of `signin.user_suspended`, `signin.product_paused` or `signin.user_deleted` shall add the matching `ended` reason (`user_suspended`, `product_paused`, `user_deleted`) to Cloud's sign-in page, and any other refusal shall add none, so no text from Cloud's answer reaches the address. A failed exchange shall be recorded in the error log.

After a successful exchange, the return shall answer a 303 to `/`, without the `code` or the `state` in the address, and shall set the session token in the server's session cookie and the refresh credential in `__Host-halonic-refresh`, both `Path=/`, `Secure`, `HttpOnly`, `SameSite=Strict` and no `Domain`, with a `Max-Age` up to the token's end and the session's end, and shall clear the state cookie. These cookies shall replace any earlier session's, so every sign-in starts a new session. A token or refresh credential that isn't 1 to 8192 base64url or token characters shall be treated as a failed exchange and never written into a cookie. Every answer of both routes shall carry `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, and the request log shall leave out the return route.

Rationale: the `state` cookie ties a returning code to the browser that started the sign-in, so a code from someone else's sign-in can't start a session here, and keeping the code out of the log, the address and any referrer keeps it from being read before it is used.

## Examples

- Given a start, then Cloud's address and the cookie hold the same 43-character `state`, and a second start gives another.
- Given a return with the code and the `state` of the cookie, then the code is exchanged once and the browser lands on `/` signed in.
- Given a return with no state cookie, an empty one, two of them, or a `state` that differs in one character, then the code is not exchanged.
- Given Cloud refusing with `signin.product_paused`, then the browser goes to Cloud's sign-in page with `ended=product_paused`; given `signin.link_expired`, then it goes there with no reason.
- Given a refresh credential with a `;` in it, then no cookie is set and the error is logged.
