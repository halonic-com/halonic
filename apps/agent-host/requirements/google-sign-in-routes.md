# agent-host.google-sign-in-routes

- Status: active
- Since: 0.1.0
- Source: HAL-9409; Liam's decision on HAL-10018

When Studio starts a Google sign-in on the agent host, the agent host shall read who Google must confirm from the connector the setup's record is linked to, in the served workspace the record names, and shall start the sign-in with the setup's client and the services of the workspace's integrations, never with an address or a service the request names. The request names the account by its ref only, and the agent host shall refuse a ref that isn't a ref, before it reads anything. The agent host shall send Google's redirect to the port it serves on, and shall answer only the address to open in the browser, never a state, a verifier, a token or a client secret. If no served workspace holds the record's connector, then the agent host shall answer 404. When Studio cancels the sign-in, the agent host shall drop the pending sign-in, so that a callback that still arrives matches nothing, and shall answer 204 whether or not one was pending. If the agent host can't finish, then it shall answer 502 `google_failed` with a fixed message and keep the detail in its own log.

## Examples

- Given a setup linked to a Google connector of a served workspace,
  when Studio starts the sign-in,
  then the answer holds an address that names the connector's account as the login hint and the host's own port in the redirect.
- Given a setup linked to a connector the served workspaces don't hold,
  when Studio starts the sign-in,
  then the answer is 404.
- Given a started sign-in,
  when Studio cancels it,
  then the answer is 204 and a callback with its state finishes nothing.
- Given a ref that holds `/`, `..` or capital letters,
  when the host reads the request,
  then the answer is 400 and nothing is read from disk.
