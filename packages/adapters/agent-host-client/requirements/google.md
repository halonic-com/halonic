# agent-host-client.google

- Status: active
- Since: 0.1.0
- Source: HAL-9911, HAL-9409, HAL-9910; Liam's decision on HAL-9902; `agent-host.google-routes`

The Google stand-in shall offer `disconnect` with one account's ref, and ask the host's `POST /v1/google/disconnect` with that ref and nothing else, so the page never sends or reads a token or a client secret. It shall answer whether Google confirmed and what became of the client secret. It shall also offer `start` (the connector's workspace and id, and the account type, answering the new ref), `edit` (the ref and one change a person makes), `startOver` (answering the fresh record's ref), `startSignIn` (answering the address to open) `cancelSignIn`, `saveClientSecret` and `replaceClientSecret`, each asking the host's route of that name with the ref and nothing else, so the page never sends or reads a token. The two secret calls take the secret as a value that gives its text only when asked: they shall ask for it once, only while building the request to `POST /v1/google/secret` or `POST /v1/google/secret/replace`, and shall not keep it, close over it or put it in an error. `replaceClientSecret` shall answer the host's outcome as its own word (`replaced`, `accepted` with the accounts it fixed, `refused`, `signInRefused`, or an unfinished check such as `unreachable`) and shall fail with `answer_invalid` for a word it doesn't know, never take it for another. It shall fail with the host's kind when the host refuses (`google_setup_not_found`, `google_failed`), and with `answer_invalid` for an answer that isn't the route's.

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
- Given a signed-in account and a new secret Google accepted,
  when Studio replaces the secret,
  then the host gets the ref and the secret, and the answer is `accepted` with the accounts it fixed.
- Given a host that answers a word the stand-in doesn't know,
  when Studio replaces a secret,
  then it fails with the kind `answer_invalid`.
- Given a host that refuses a replace,
  when Studio replaces a secret,
  then the error holds no part of the secret and has no cause.
