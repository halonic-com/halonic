# agent-host.google-setup-write-routes

- Status: active
- Since: 0.1.0
- Source: HAL-9409; Liam's plan approval on HAL-9409

When Studio starts, edits or starts over a Google setup on the agent host, the agent host shall run the Google setup's own start, edit or start-over handler with the setup records of the profile it serves, and answer what the handler answers. Starting names the connector it is for (`workspace` and `id`) and the account type, and the record keeps that link. An edit names the account by its ref and carries one change a person makes; the agent host shall refuse a change that says the account signed in, saved a secret or passed a check, because only the host records those. Starting over removes the record, the refresh token and the client secret (not while another account uses the client), without asking Google. The agent host shall refuse a body with an unknown key, or a ref that isn't a ref, before it reads anything. If the account has no setup, then the agent host shall answer 404. If the agent host can't finish, then it shall answer 502 `google_failed` with a fixed message and keep the detail in its own log.

## Examples

- Given a connector, when Studio starts a setup for it, then the answer is 201 with an `accountRef` and the record holds the connector link.
- Given a record, when Studio edits its project ID, then the record holds the new project ID.
- Given a record, when Studio sends the edit `signed-in`, then the answer is 400 and the record is unchanged.
- Given a ref with no setup, when Studio edits it or starts it over, then the answer is 404.
- Given a signed-in account, when Studio starts over, then the record and the refresh token are gone.
- Given a ref that holds `/` or `..`, when Studio edits it, then the answer is 400 and nothing is read from disk.
