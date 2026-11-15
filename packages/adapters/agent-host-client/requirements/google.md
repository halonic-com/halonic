# agent-host-client.google

- Status: active
- Since: 0.1.0
- Source: HAL-9911, HAL-9409; Liam's decision on HAL-9902; `agent-host.google-routes`

The Google stand-in shall offer `disconnect` with one account's ref, and ask the host's `POST /v1/google/disconnect` with that ref and nothing else, so the page never sends or reads a token or a client secret. It shall answer whether Google confirmed and what became of the client secret. It shall also offer `start` (the connector's workspace and id, and the account type, answering the new ref), `edit` (the ref and one change a person makes), `startOver` (answering the fresh record's ref), `startSignIn` (answering the address to open) and `cancelSignIn`, each asking the host's route of that name with the ref and nothing else, so the page never sends or reads a token or a client secret. It shall fail with the host's kind when the host refuses (`google_setup_not_found`, `google_failed`), and with `answer_invalid` for an answer that isn't the route's.

## Examples

- Given a host that disconnects the account `gaccount_one`,
  when Studio disconnects it,
  then the host gets `{ accountRef: "gaccount_one" }` and the answer says `googleConfirmed` true.
- Given a host whose Google didn't answer,
  when Studio disconnects an account,
  then the answer says `googleConfirmed` false.
- Given a host with no setup for the ref,
  when Studio disconnects it,
  then it fails with the kind `google_setup_not_found`.
- Given a host that answers something else with 200,
  when Studio disconnects an account,
  then it fails with the kind `answer_invalid`.
- Given a connector `mail` of workspace `acme`,
  when Studio starts a setup for it,
  then the host gets the account type and the link `{ workspace: "acme", id: "mail" }`, and the answer is the new ref.
- Given a record,
  when Studio edits it with one change,
  then the host gets the ref and that change.
- Given a pending sign-in,
  when Studio cancels it,
  then the host gets the ref and the empty answer is taken as done.
