# server.google-sign-in-orphan-token

- Status: active
- Since: 0.1.0
- Source: HAL-9401 (follow-up of HAL-9394); builds on `server.google-sign-in`

When the sign-in callback finishes a sign-in but the setup's record is gone, because it was deleted between the start and the callback, the server shall remove the refresh token that finishing stored, answer the page for a link that is no longer valid, and raise no error. When the record can't be updated for any other reason, the server shall keep the token and fail the request as before.

Rationale: a refresh token no record points at can't be disconnected by anyone, so it would stay in the token store for good. A token whose record still exists is found by Disconnect, so it stays.

## Examples

- Given a sign-in started for a setup that is then deleted, when Google's callback finishes the sign-in, then the token store has no token for that account and the page says the link is no longer valid.
- Given a record update that fails with a disk error, then the answer is 500 and the token stays.
