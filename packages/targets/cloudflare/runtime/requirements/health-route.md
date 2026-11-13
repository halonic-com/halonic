# runtime.health-route

- Status: active
- Since: 0.1.0
- Source: HAL-6802; design review HAL-6790 (Elena, 12 Nov)

The Worker's `fetch()` shall, until `host/server` is on `main` (HAL-195), answer `GET` and `HEAD` on `/health` with status 200 and exactly `{"status":"ok"}`, without a sign-in. The answer shall carry no version, no configuration and no name of anything bound to the Worker. Every other path shall answer 404 and every other method on `/health` shall answer 405 with an `Allow` header, each with a code and a short message. No Studio file shall be served.

Rationale: a caller who has not signed in must learn nothing about the deployment, and the Studio files must not be served before the API behind them exists.

## Examples

- Given `GET /health`, then the answer is 200 with the body `{"status":"ok"}`.
- Given `GET /api/hello` or `GET /` or `GET /index.html`, then the answer is 404.
- Given `POST /health`, then the answer is 405 and `Allow` is `GET, HEAD`.
