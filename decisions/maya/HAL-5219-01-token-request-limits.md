# Decision: time limit on Google sign-in token requests

- Approval: [HAL-5219](/HAL/issues/HAL-5219)
- Kind: internal

The exchange, refresh, check and revoke requirements gain a 10 second limit, and revoke refuses a redirect instead of following it with the refresh token. The tests for them gain the same cases; no test is removed.

## Covers

- google-sign-in.exchange
- google-sign-in.revoke
