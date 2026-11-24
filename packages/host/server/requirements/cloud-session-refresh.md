# server.cloud-session-refresh

- Status: active
- Since: unreleased
- Source: HAL-13551 (selling layer S2-18), plan approved on the task; Cloud's `control-plane.app-session-routes` and `control-plane.sessions`

When a many-user server has Cloud sign-in, `POST /api/session/refresh` shall send the refresh credential from exactly one `__Host-halonic-refresh` cookie to Cloud's refresh, once, and on a new session shall answer 204 and set the session token in the server's session cookie and the next refresh credential in `__Host-halonic-refresh`, both `Path=/`, `Secure`, `HttpOnly`, `SameSite=Strict` and no `Domain`, with a `Max-Age` up to the token's end and the session's end. A token or refresh credential that isn't 1 to 8192 base64url or token characters shall never be written into a cookie and shall be recorded in the error log. With no refresh cookie, two of them or an empty one, when Cloud says the session ended, when Cloud says nothing about the credential, and when Cloud's answer can't be kept in a cookie, the refresh shall answer 401 with the error `session_ended` and clear both cookies; the answer shall carry Cloud's end reason as `ended` only when it is `expired`, `signed_out`, `signed_out_everywhere`, `user_suspended`, `product_paused` or `user_deleted`. When Cloud can't be reached or can't answer, the refresh shall answer 503 with the error `session_refresh_unavailable`, keep both cookies and record the failure in the error log.

`POST /api/sign-out` shall answer 204 and clear the session cookie and `__Host-halonic-refresh`. Both routes shall answer only `POST`, and shall refuse with `from_other_site` a request whose `Sec-Fetch-Site` header is present and isn't `same-origin`. Only these two routes shall read the refresh cookie.

When a session's claims pass the shared claim checks, the checked session shall carry the `sid` claim as its session id when it is 1 to 128 printable ASCII characters, and no session id otherwise; the session id shall never decide whether the claims pass.

Rationale: the refresh credential is used once, so it lives in a strict, host-only cookie that only the refresh reads, and a session Cloud ended is cleared here too; an outage at Cloud uses nothing up, so it keeps the person signed in.

## Examples

- Given a refresh cookie that Cloud accepts, then the answer is 204 with a new token and a new refresh credential in the cookies.
- Given Cloud answering that the session ended as `signed_out`, then the answer is `session_ended` with `ended` = `signed_out`, and both cookies are cleared.
- Given Cloud unreachable, then the answer is 503 and no cookie is set.
- Given a refresh with `Sec-Fetch-Site: cross-site`, then Cloud is never asked.
- Given claims with `sid` = `ses_1`, then the checked session's id is `ses_1`; given no `sid`, it is `null`.
