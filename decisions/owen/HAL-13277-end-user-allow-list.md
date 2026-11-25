# Decision: a many-user server no longer serves the Studio page or starts agent runs

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13277 (selling layer design, sections 16.1 and 16.3, approved by the board on HAL-45)
- Kind: user-visible
- Signature:

`server.many-users` said the Studio page answers without a session on a many-user server. The
board's requirement of 19 Nov makes the end-user client read-only: an end user may not change the
project or see how it is set up, and the deployment enforces it. A many-user server now answers 404
for the Studio page and for `POST /api/agent-runs`; the new `server.end-user-routes` lists what it
does answer. The route-table test's list of run routes loses `POST /api/agent-runs` for the same
reason. No other test is weakened.

## Covers

- server.many-users
