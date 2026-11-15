# Decision: the run token authorises nothing from the moment the bridge starts closing

- Requirements: `harness-bridge.server` (`packages/adapters/harness-bridge/requirements/server.md`)
- Task: HAL-3105, step 2 of HAL-3023
- Approval: the maintainer (Liam) approves and signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:+gOjHAb14M8Eil9pfc25Ap/FYaTkKHfEBL0SGW1fioAC0Yu0dgrePJLNCKhyg9wcqbbOU3AiFgiOFOrkc5dBCA==

## What changes

`harness-bridge.server` is extended, not weakened. It now says that closing the bridge is the kill
switch: from the moment closing begins (the caller closes it, or the run's signal aborts), the run
token authorises nothing, even on a connection that is still open, and that one token covers the
model routes and the MCP routes alike. Everything the requirement said before still holds.

The code check is one line in `bridge.ts`: a request is refused with a 401 once the closing signal
has aborted, whatever token it carries. Before, the refusal came only from the socket being shut.

## Tests

No test was removed or skipped. Three tests in `mcp-route.test.ts` are new: another run's token on
`/mcp` is refused and nothing runs or is recorded; a call after the run ended is refused; a call
while the bridge is closing is refused.

## Covers

- harness-bridge.server
- packages/adapters/harness-bridge/src/mcp-route.test.ts
