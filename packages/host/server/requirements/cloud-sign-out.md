# server.cloud-sign-out

- Status: active
- Since: unreleased
- Source: HAL-17539, from the security review of HAL-13551; Cloud's `control-plane.app-session-routes` and `control-plane.sessions`

When a many-user server has Cloud sign-in, `POST /api/sign-out` shall send the refresh credential from exactly one non-empty `__Host-halonic-refresh` cookie to Cloud's sign-out, once, before it clears the cookies, so Cloud ends the session and a copy of the credential no longer refreshes. With no refresh cookie, two of them or an empty one, it shall not ask Cloud. When Cloud can't be reached or answers anything but the session's end, the sign-out shall still answer 204 and clear both cookies, and record the failure in the error log.

Rationale: clearing the cookies alone leaves the session open at Cloud for up to 30 days, so a stolen refresh credential would keep working; a person who signs out is still signed out here while Cloud is down.

## Examples

- Given a refresh cookie, when the person signs out, then Cloud's sign-out gets that credential before the answer clears both cookies, and Cloud's next refresh with it answers that the session ended as `signed_out`.
- Given Cloud unreachable, when the person signs out, then the answer is 204, both cookies are cleared and the error log has the failure.
- Given no refresh cookie, then Cloud isn't asked and both cookies are cleared.
