# Decision: the sign-in limit counts per client address, and the host decides the scheme

- Task: HAL-8164, the follow-ups accepted in the review of #2353 (HAL-8125)
- Approval: Liam reviewed #2373 on HAL-8164 and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:pm6uW0V9fsKXpirfuXydyTSQ5HHfgM6OJoYohRDYOZ4UAZ5sZq6aTS3cdz3wau/Bt0s22uVpHMkGGWZuy7tWAw==

## What changes

- `server.login-limit`: the limit of 10 attempts in 15 minutes now counts per client address,
  with 100 for the whole server as a ceiling. The address comes only from the host (the socket
  address on Node, `CF-Connecting-IP` on Cloudflare), never from a header the client sets. An
  IPv6 address counts by its /64 and an IPv4-mapped address as its IPv4 address. With no
  address from the host, the old limit of 10 for the whole server stays.
- `server.session`: the cookie name and `Secure` follow the scheme the host gives, so a host
  behind a proxy that ends TLS gets the `Secure` cookie. Forwarded headers are never read.
  With no scheme from the host, the request URL decides, as before.
- `server.api`: `handle` takes an optional `RequestContext` with the address and the scheme.

## Why

A count for the whole server let an outsider keep the owner from signing in by guessing.
Behind a TLS proxy the request URL says `http`, which gave the cookie without `Secure`. No host
calls `handle` yet and no user sees a change, so this is internal. Every old example still
holds, and no test was weakened.

## Covers

- server.api
- server.login-limit
- server.session
