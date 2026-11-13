# server.daily-requests

- Status: active
- Since: 0.1.0
- Source: HAL-7197; format.deployments-cloudflare; build plan on HAL-195 (PR 4)

The server shall count every request that passes the `Host` and `Origin` checks against `dailyRequests`, per UTC day, in the `RequestCountStore` port, before it reads the body or routes the request. The count shall include `GET /api/hello`, the sign-in routes and every other route. A request past the ceiling shall get status 429 with the code `daily_limit_reached` and a `Retry-After` header holding the whole seconds up to the next UTC midnight, and it shall never reach a route, so it never starts a run. A request refused by the `Host` or `Origin` check shall not be counted, so a caller with a foreign `Host` can't use up the day. A server with no `dailyRequests` shall not count and shall not touch the store. The ceiling shall be the same on every host, because it is checked here and not in a host target.

Rationale: `limits.dailyRequests` bounds what a stolen link or a loop can cost. One check in the shared handler gives `halonic serve` and Cloudflare the same behaviour, and a deployment moved between hosts keeps its ceiling.

## Examples

- Given `dailyRequests` of 3, when 4 requests arrive on one UTC day, then the fourth gets 429 and the first three are answered.
- Given the ceiling is reached at 23:59:30 UTC, then `Retry-After` is 30, and the first request after midnight is answered.
- Given a request with a foreign `Host` when the day's count is below the ceiling, then the count stays the same.
