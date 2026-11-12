# server.login-limit

- Status: active
- Since: 0.1.0
- Source: HAL-6 finding 6; build plan on HAL-195 (PR 3)

The server shall allow at most 10 sign-in attempts in each 15-minute window, counted in the `Coordination` port under one key, so every instance of a deployment shares the count. It shall count an attempt before it checks the password, and shall answer an attempt over the limit with 429, the code `too_many_attempts` and a `Retry-After` of the seconds until the window ends, without checking the password. A malformed request (400) shall not count.

Rationale: a password check at the approved scrypt settings takes one to three seconds of the host's time. Without a limit, guessing is free for an attacker and expensive for the host. The count is for the whole server, not per address, because the handler has no trustworthy client address; the cost is that someone who keeps guessing keeps the owner out until the window ends.

## Examples

- Given 10 wrong passwords in a minute, then the 11th attempt answers 429 even with the right password, and the hasher is not called for it.
- Given the window has ended, then the next attempt is checked again.
