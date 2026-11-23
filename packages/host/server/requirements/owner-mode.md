# server.owner-mode

- Status: active
- Since: unreleased
- Source: HAL-13213; selling layer design (HAL-12483), section 1

Where the server is built for one owner (no many-user ports, the default), it shall behave as it did before many users existed: the password sign-in at `POST /api/login` starts a session, a session cookie from it signs the caller in, a session token from a `SessionVerifier` (as a cookie or a bearer token) signs nobody in, and a server with no password answers only loopback names.

Rationale: a deployment that doesn't sell to many people must keep working exactly as before.

## Examples

- Given an owner's server with a password, then the right password starts a session that `GET /api/session` accepts.
- Given an owner's server and a bearer token alone, then `GET /api/session` answers 401.
