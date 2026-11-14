# Decision: an agent run the executor refuses on purpose answers 501 not_implemented

- Task: HAL-9359
- Approval: Liam approves this note in review on the review task of this pull request
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:VgC1tdpQvXte1kyAjbYLK27tjHsPQWQj9hmL3WTkKEe0L+KCzD9nkPBD3PWhpXbm0QnVF1OvD2ANMa1VrwtJBQ==

## What changes

`server.trust-gate` said any failure of a start other than a missing target answers 500. It now says
a `startAgent` that the executor refuses with `AgentRunsNotAvailable` answers 501 with the code
`not_implemented` and a fixed message; every other failure still answers 500. The local executor
throws that error, which is new in `@halonicjs/ports` (`ports.agent-runs-not-available`). The
`trust-gate` tests keep all their cases and gain two: the 501 case, and one other failure still a 500.

## Why

The local executor refuses agent runs on purpose until the agent loop (engine step 4) exists. A 500
says the server broke; this is "not built yet". The board chose option A on HAL-9358. The server
matches the typed error, not the message. The error, its requirement and the mapping are marked
to be removed when step 4 lands.

## Tests

No test is skipped or deleted. One engine test now checks the typed error instead of the message text.

## Covers

- server.trust-gate
