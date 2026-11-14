# server.google-account-actions

- Status: active
- Since: 0.1.0
- Source: HAL-710 (build plan B5, D6); google setup flow 3.5 (Check again) and 4.4 (Disconnect)

The server shall, behind the sign-in and the same-site check, answer `POST /api/google/setups/<accountRef>/check` by checking the ticked services again, saving each result on the record and answering with the results. A refused refresh shall be saved on the record as `signInRefused` or `clientRefused`, so no later check asks Google again while it is saved. `POST …/disconnect` shall ask Google to revoke the refresh token, then remove the refresh token, the setup record and the client secret, except that the secret shall stay while another account uses the client. It shall remove them whether or not Google answers, and answer whether Google confirmed. A setup without a client ID and secret shall be refused with 409 `google_setup_incomplete` for a check. No answer shall hold a token, a secret or text from Google beyond its error code.

Rationale: these actions touch Google with the account's own credentials, so they are the user's own page's requests, and what they find is kept so the connector's state doesn't need another request.

## Examples

- Given a signed-in setup and a Google that grants the scopes, then a check answers `checked` and the record holds each service's result.
- Given a Google that refuses the refresh token, then the record holds the `sign-in` refusal and a second check sends nothing.
- Given a setup shared by two accounts, then disconnecting one keeps the client secret for the other.
