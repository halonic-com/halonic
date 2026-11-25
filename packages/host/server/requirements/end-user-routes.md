# server.end-user-routes

- Status: active
- Since: unreleased
- Source: HAL-13277; selling layer design (HAL-12483), sections 16.1 and 16.3; `GET /api/account-menu` from HAL-18215

Where the server is built for many users (`users.mode: many`), every caller is an end user, and the server shall answer only the routes on the end-user allow list: `GET /api/hello`, the Cloud sign-in, refresh and sign-out routes, `GET /api/session`, `GET /api/account-menu`, `GET /api/waiting-runs`, `POST /api/runs`, `GET /api/runs/<id>`, `GET` and `POST /api/runs/<id>/events` and `POST /api/runs/<id>/cancel`. Every other route of an owner's server, among them `POST /api/agent-runs`, `POST /api/chat-turn`, `POST /api/connector-calls`, the provider-key, Google, trust and workspace routes, the password sign-in and the served Studio pages, shall answer the same 404 as an unknown address, with or without a session. The many-user server shall not be given the Studio page.

Rationale: the app is open source, so the deployment, not the app, keeps an end user from changing the project or seeing how it is set up. A route a later change adds stays hidden from end users until someone puts it on the list.

## Examples

- Given a many-user server and a signed-in end user, when they ask for `/` or `POST /api/agent-runs`, then the answer is 404 `not_found`.
- Given a route added to the many-user table but not to the allow list, then the allow-list test fails.
