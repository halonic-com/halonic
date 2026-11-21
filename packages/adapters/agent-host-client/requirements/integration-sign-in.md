# agent-host-client.integration-sign-in

- Status: active
- Since: unreleased
- Source: HAL-8613 (Studio part of HAL-984 design section 6, wording approved on HAL-8619); `agent-host.integration-sign-in-routes`

The integration sign-in stand-in shall offer `status` with an integration's name, and `start`, `cancel` and `signOut` with an integration's and a sign-in's names, each asking the host's route of that name under `/v1/integrations/sign-in/` with those names and nothing else, so the page never sends or reads a code, a token or a client secret. `status` shall answer each sign-in's state (`signedIn`, `signedOut`, `approvalChanged` or `cannotSignIn`) and how its last sign-in ended, when one did; `start` shall answer the address to open; `cancel` shall succeed on the host's 204; and `signOut` shall answer whether the person was signed in and what the provider said to the revoke. `signOutAll`, with an integration's name, shall ask the host's `sign-out-all` route and answer each sign-in it signed out and how. It shall fail with the host's kind when the host refuses, and with `answer_invalid` for an answer that isn't the route's, such as a state or an outcome it doesn't know, never take it for another.

## Examples

- Given a host where the `gitlab` integration's sign-in `account` is signed in,
  when Studio asks for its status,
  then the host gets `{ integration: "gitlab" }` and the answer is `[{ signIn: "account", state: "signedIn" }]`.
- Given the last sign-in was cancelled at the provider,
  when Studio asks for the status,
  then the sign-in carries the outcome `cancelled`.
- Given a sign-in Studio starts,
  then the host gets `{ integration: "gitlab", signIn: "account" }` and the answer is the authorize URL.
- Given a client secret that isn't set,
  when Studio starts the sign-in,
  then it fails with the kind `client_secret_missing`.
- Given a pending sign-in,
  when Studio cancels it,
  then the host answers 204 and the call succeeds.
- Given a provider that didn't confirm the revoke,
  when Studio signs out,
  then the answer is `signedOut` with the revoke `notConfirmed`.
- Given a host that signed out the `gitlab` integration's sign-in `account`,
  when Studio signs out all of its sign-ins,
  then the host gets `{ integration: "gitlab" }` and the answer names `account` with what the provider said.
- Given a host that answers a state Studio doesn't know,
  when Studio asks for the status,
  then it fails with the kind `answer_invalid`.
