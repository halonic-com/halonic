# server.engine-server

- Status: active
- Since: unreleased
- Source: HAL-14230; B1 design note D3 on HAL-14206, security review on HAL-14212 (section 1)

Where the engine role serves its HTTP API, `createEngineServer` shall answer only the shell that launched it: before it looks at the path, it shall refuse a `Host` other than `127.0.0.1:<port>` or `localhost:<port>` with 421 `host_not_allowed`, any `Origin` header with 403 `origin_not_allowed`, and a request without `Authorization: Bearer <launch token>` with 401 `launch_token_required` and `WWW-Authenticate: Bearer`, comparing the token in constant time (`contracts.launch-token-refusal`). It shall have no sign-in, no password and no route served without the token, and it shall refuse to start with a token shorter than 32 random bytes as base64url. It shall serve, built from the route factories and never through `createServer`, exactly these routes: `GET /api/hello`, which answers only `{ "runExecutorVersion": … }` and names no product or version; `POST /api/runs`, `POST /api/agent-runs`, `GET /api/waiting-runs`, `GET /api/runs/<runId>`, `GET` and `POST /api/runs/<runId>/events`, `POST /api/runs/<runId>/cancel` (each as `serve` answers it, starts behind the trust gate and taking only JSON), `GET /api/run-updates` (`server.engine-run-updates`) and the two routine routes (`server.engine-routines`). Any other path answers 404 `not_found` to a caller with the token. A body over `maxBodyBytes` answers 413. An unexpected failure answers 500 with a fixed message, its cause going only to the error log, and every answer carries the security headers.

Rationale: another program or OS user on the computer can reach the loopback port, and only the token stops it. `createServer` also mounts trust, provider-key, webhook, connector-call, chat-turn, Google, workspace and page routes, some of them served without a sign-in, so the engine never uses it.

## Examples

- Given a request to `/api/trust`, `/api/hello`, `/api/webhooks/acme/digest` or `/` with the token, then it answers 404.
- Given a request to any engine route without the token, then it answers 401, and nothing is started or read.
- Given the engine's route list, then it is exactly the eleven routes above.
- Given `GET /api/hello` with the token, then it answers only the run executor version.
- Given a launch token of 5 characters, then the server doesn't start.
