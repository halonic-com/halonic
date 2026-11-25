# server.many-users

- Status: active
- Since: unreleased
- Source: HAL-13213; selling layer design (HAL-12483), sections 3.1, 3.2 and 13; threat model (HAL-13208)

Where the server is built for many users (`users.mode: many`), it shall take every principal from the session the `SessionVerifier` port checked, and never read a user id, organisation id or scope from the request's address, headers or body. Each route that works with runs shall get its run ports only from the host's per-principal factory, for that principal's scope, and the many-user routes shall never be given the deployment's unscoped run ports. The server shall have no shared password there: `POST /api/login` and every other route of an owner's server that isn't a run route shall answer the same 404 as an unknown address. `GET /api/hello` and the Cloud sign-in routes shall answer without a session, and the Studio page shall answer 404 (`server.end-user-routes`); every other route shall answer 401 `not_signed_in` without one, with the same body whatever the reason. `GET /api/session` shall give the session's scope and role, never its client. The `Host` and `Origin` checks, the daily ceiling and the body limit shall stay as for an owner's server. The server shall refuse to start with a session verifier marked as made for tests.

Rationale: whose data a request reaches must come from a checked session alone, so one user can never name another's scope, and a test verifier that checks no signature must never guard a deployment.

## Examples

- Given a session for one end user and a request whose query string, header or body names another user's scope, then the request works in the session's own scope.
- Given two end users, then each one's run list holds only their own runs, and one can't read the other's run by id.
- Given a many-user server and `POST /api/login`, then the answer is 404 `not_found`.
- Given a many-user server built with the stub verifier outside the package's tests, then it doesn't start.
