# server.login-limit

- Status: active
- Since: 0.1.0
- Source: HAL-6 finding 6; build plan on HAL-195 (PR 3); HAL-8164

The server shall allow at most 10 sign-in attempts in each 15-minute window for each client address, counted in the `Coordination` port, so every instance of a deployment shares the count, and at most 100 in the window for the whole server as a ceiling. The client address shall be the `clientAddress` of the `RequestContext` that the host passes to `handle`, which a host fills only from what it can vouch for (the socket address on Node, `CF-Connecting-IP` on Cloudflare) and never from a header the client sets. When the host passes no client address, the server shall allow at most 10 attempts in the window for the whole server. It shall count an attempt before it checks the password, the client's own count first, so an attempt refused for its address does not use up the server's count. It shall answer an attempt over a limit with 429, the code `too_many_attempts` and a `Retry-After` of the seconds until that window ends, without checking the password. A malformed request (400) shall not count.

Rationale: a password check at the approved scrypt settings takes one to three seconds of the host's time. Without a limit, guessing is free for an attacker and expensive for the host. A count for the whole server alone lets an outsider keep the owner out by guessing; a count per address stops that, and the ceiling still bounds the host's work when many addresses guess together. A client address taken from a header would let a guesser pick a fresh one for every attempt.

## Examples

- Given 10 wrong passwords in a minute, then the 11th attempt answers 429 even with the right password, and the hasher is not called for it.
- Given the window has ended, then the next attempt is checked again.
- Given 10 wrong passwords from one address, then the 11th attempt from it answers 429, and an attempt from another address is still checked.
- Given 100 attempts from many addresses in a window, then the next attempt from a new address answers 429.
- Given a client that sends `X-Forwarded-For`, then the count does not change with it.
- Given no client address from the host, then the 11th attempt in the window answers 429 for everyone.
