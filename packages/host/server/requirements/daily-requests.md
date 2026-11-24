# server.daily-requests

- Status: active
- Since: unreleased
- Source: HAL-7197; format.deployments-cloudflare; build plan on HAL-195 (PR 4)

The server shall count against `dailyRequests`, per UTC day, in the `RequestCountStore` port, every request that proved who sent it: a signed-in request (on a many-user server, one whose session is verified) and a webhook delivery whose signature is proven. It counts the request after that proof and before the route answers. A request past the ceiling shall get status 429 with the code `daily_limit_reached` and a `Retry-After` header holding the whole seconds up to the next UTC midnight, and it shall never reach the route, so it never starts a run. Any other request, including `GET /api/hello`, a sign-in attempt, an unsigned or wrongly signed webhook and a request the `Host` or `Origin` check refused, shall not be counted, so a caller who can't sign in can't use up the day; the sign-in limiter guards the sign-in. A server with no `dailyRequests` shall not count and shall not touch the store. The ceiling shall be the same on every host, because it is checked here and not in a host target.

Rationale: `limits.dailyRequests` bounds what a stolen link or a loop can cost. Every route that costs money needs a session or a webhook signature, so counting only those keeps the bound without letting anyone with the address lock the API. One check in the shared handler gives `halonic serve` and Cloudflare the same behaviour, and a deployment moved between hosts keeps its ceiling.

## Examples

- Given `dailyRequests` of 3, when 4 signed-in requests arrive on one UTC day, then the fourth gets 429 and the first three are answered.
- Given the ceiling is reached at 23:59:30 UTC, then `Retry-After` is 30, and the first request after midnight is answered.
- Given a request with a foreign `Host` when the day's count is below the ceiling, then the count stays the same.
- Given `dailyRequests` of 1, when many requests without a session arrive, then a signed-in request is still answered.
