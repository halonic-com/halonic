# Decision: the polling requirement gains a team status example

- Task: HAL-17633
- Approval: Liam approves this change on HAL-17633, as its reviewer. The example is named in the task's "Done when", from the phase 2 plan the board approved on HAL-17544.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:0laUvyjPaYY5Edr6RJUwxcZsi+Ckead+/w1hbvfY1gtaJLpqVcSwehqFIjQQGMAx+lTkZ0EYnh3dPZGSsyKSDw==

## What changes

`agent-host.paperclip-polling` gains one example: on the 30-second messaging poll the engine
doesn't read a connection's team status, which it reads on its own 5-minute tick
(`agent-host.team-status-hub`, new). The requirement's text and its other examples stay as they
are. No test is weakened or removed; one test is added for the new example.

## Why

The phase 2 architecture note (HAL-17511, section 1.5) keeps team status off the 30-second poll,
so a reader of the polling requirement learns where team status is read.

## Covers

- agent-host.paperclip-polling
