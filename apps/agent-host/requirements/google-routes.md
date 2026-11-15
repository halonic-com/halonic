# agent-host.google-routes

- Status: active
- Since: 0.1.0
- Source: HAL-9911; Liam's decision on HAL-9902

When Studio disconnects a Google account on the agent host, the agent host shall run the Google setup's own disconnect itself, with the setup records and the sealed tokens of the profile it serves: it asks Google to end the sign-in, then removes the refresh token, the record and the client secret, and not the client secret while another account uses its client. The request names the account by its ref only, and the agent host shall refuse a ref that isn't a ref, before it reads anything. The agent host shall never answer a token, a client secret or a client ref. If the account has no setup, then the agent host shall answer 404. If the agent host can't finish, then it shall answer 502 `google_failed` with a fixed message and keep the detail in its own log. Without a profile folder, the agent host shall serve no Google route.

## Examples

- Given an account that is signed in,
  when Studio disconnects it and Google confirms,
  then the refresh token and the record are gone, and the answer says `disconnected` and `googleConfirmed`.
- Given an account that is signed in and Google that doesn't answer,
  when Studio disconnects it,
  then the token and the record are gone, and the answer says `googleConfirmed` is false.
- Given two accounts that share one client,
  when Studio disconnects one,
  then the client secret stays for the other.
- Given a ref with no setup,
  when Studio disconnects it,
  then the answer is 404.
- Given a ref that holds `/`, `..` or capital letters,
  when the host reads the request,
  then the answer is 400 and nothing is read from disk.
- Given a profile whose token key isn't set,
  when Studio disconnects an account,
  then the answer is 502 `google_failed`, the host's log holds the cause, and the answer doesn't.
