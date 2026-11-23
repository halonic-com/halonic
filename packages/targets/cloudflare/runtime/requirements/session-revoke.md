# runtime.session-revoke

- Status: active
- Since: unreleased
- Source: HAL-6702 (`DeployTarget.revokeSessions`); decided on HAL-16732

The Worker shall answer `POST /admin/sessions/revoke`, behind the admin key (`runtime.admin-key`), by ending every session with the sign-in's `revokeAllSessions` (`server.session-revoke`) on the deployment's own `Coordination` store, and shall answer 204 with `Cache-Control: no-store` and no body. It shall take no lock, and shall neither answer nor log the new session generation. A deployment missing a binding or a secret shall answer 503 `unavailable`, as `host/server` does.

Rationale: revoking is the emergency action after a leak, so it must work while a stuck deploy holds the deploy lock, and the admin key already keeps it to whoever may change the deployment.

## Examples

- Given the right admin key, then `POST /admin/sessions/revoke` answers 204 and every session ends.
- Given no key, or a wrong one, then it answers 401 and no session ends.
- Given `GET /admin/sessions/revoke`, then it is the admin routes' 404 and no session ends.
