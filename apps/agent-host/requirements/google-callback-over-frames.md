# agent-host.google-callback-over-frames

- Status: active
- Since: unreleased
- Source: HAL-10029; Liam's approval of the plan on HAL-10017 (Revision 2)

When the agent host serves over frames (`--stdio --relay-host`), the agent host shall send Google's redirect to the relay's port at `/v1/google/callback`, the one path Studio's relay passes on without the launch token, and shall serve that callback with the same route table, the same `Host`, `Origin` and `state` checks, and the same fixed page as on its own port. The page shall carry `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and `Connection: close`, because the code is in the address bar and the history, and the relay learns that the answer ended only when the host closes the connection. The agent host shall serve the callback at `/v1/google/callback` only over frames, and at `/api/google/callback` only on its own port. The sign-in shall use PKCE, so that the code is useless without the verifier the agent host holds in memory.

## Examples

- Given the agent host serves over frames with relay port 50123,
  when Studio starts a sign-in,
  then the redirect address in the answer is `http://127.0.0.1:50123/v1/google/callback`.
- Given a started sign-in,
  when the browser's redirect reaches the host over a frame connection with no launch token and `Host: 127.0.0.1:50123`,
  then the host finishes that sign-in with the request's `state` and answers the fixed page.
- Given a callback request whose `Host` names another port, or that has an `Origin`,
  when the host reads it,
  then the answer is 421 or 403.
- Given a callback request with a `state` no sign-in started,
  when the host reads it,
  then the page says the link is no longer valid and nothing is saved.
- Given an answered callback,
  when the host ends the answer,
  then the connection ends at once, without waiting for Node's `keepAliveTimeout`.
