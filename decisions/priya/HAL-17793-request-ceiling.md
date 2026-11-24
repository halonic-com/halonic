# Decision: the daily request ceiling counts only signed-in requests, and webhook deliveries are remembered per secret

- Requirements: `server.daily-requests`, `server.webhooks`
- Task: HAL-17793
- Approval: HAL-17793; Liam reviews and signs this note
- Kind: user-visible
- Signature:

## What changes

`server.daily-requests`: the ceiling now counts only a request that proved who sent it, a signed-in
request (a verified session on a many-user server) or a webhook delivery whose signature is proven,
and it counts it after that proof instead of before the body is read. `GET /api/hello`, sign-in
attempts, unsigned webhooks and requests with no session are no longer counted. Two tests change to
match: the ceiling tests now send signed-in requests, and "counts every route, including ones that
answer 404" becomes "counts every signed-in request, including ones that answer 404". A test is added
that requests without a session don't use up the day. The `Host` refusal test, the reset at midnight,
`Retry-After` and the no-ceiling test keep what they check.

`server.webhooks`: the delivery id is claimed under the routine's secret instead of under the
routine's address, so a delivery one routine took is refused at every routine whose secret has the
same value. What senders sign is unchanged. One example and one test are added; no test is weakened.

## Why

Counting requests nobody signed let anyone who knows the address use up the day, after which the
API, sign-in included, answered 429 until midnight. Every route that costs money already needs a
session or a webhook signature, so the ceiling still bounds cost. The signature doesn't cover the
address, so remembering deliveries per address let two routines that share a secret each take the
same delivery.

## Covers

- `server.daily-requests`
- `server.webhooks`
