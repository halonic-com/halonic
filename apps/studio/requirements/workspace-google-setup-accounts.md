# studio.workspace-google-setup-accounts

- Status: active
- Since: unreleased
- Source: HAL-9378, HAL-9409, HAL-12413; Liam's decisions on HAL-9378 (connector link, workspace key)

When the desktop app opens a folder, it shall give the Google setup feature one account for each Google connector of the folder that has a setup record, with the address from the connector file, the services of the folder's integration sheets that ask for Google scopes, and the saved progress, found by the folder's workspace key and the connector id. It shall tell its listeners when a connector file changed and when the window comes to the front. When the app has an agent host, Disconnect shall ask the host to end the account's sign-in and remove the setup, answer whether Google ended it, and tell its listeners; if the host can't, it shall reject in plain words that it couldn't finish, without claiming anything is left or gone, and still tell its listeners so they read the accounts again. When the app has an agent host, it shall also start a setup for a connector of the folder (the record keeps the link to the folder's key and the connector's id, and a connector that already has a record keeps it), save an edit, save or replace the client secret (the page sends it once, in its own request, and the host stores it or checks it with Google first; an accepted replace lists the addresses of every account that uses the new secret, this one included, and a check that couldn't finish rejects with the old secret still in use), start over (the host removes the record, then a fresh one is started for the same connector and account type; if that second step fails, it shall say the old setup was removed), and start and cancel the sign-in, each by asking the host, and tell its listeners afterwards, also when the host failed. When the host can't, it shall reject in plain words with the host's reason; a refusal the host words itself (a 400, 403, 404 or 409 answer) shall keep the host's words and get the matching error kind, so the page shows it after its colon (HAL-12413). Without an agent host, each of these and Disconnect shall be refused as the engine not answering (`EngineNotAnswering`), and a host that doesn't answer shall reach the page the same way, so the page words it as it does for any screen: "Couldn't start the sign-in: the engine isn't answering. It may still be starting." (HAL-12413, UX check G2). It shall refuse the checks with a plain message of kind `unavailable` until the desktop app can do them, and shall not change a record itself: the app's page never writes one. The desktop app shall register the Google setup feature.

## Examples

- Given Acme's `mail` connector for `sam@acme.example` with a setup record linked to Acme and `mail`,
  then the accounts hold one account for `sam@acme.example` with that record.
- Given a record linked to another workspace's `mail`,
  then it is not Acme's account.
- Given a Google connector without a record,
  then it has no account yet.
- Given Acme's sheet with Google scopes and one without,
  then the account's services are the first sheet's only.
- Given a setup already signed in whose services were checked, and a sheet added since,
  then the added sheet is in `adding`, not in `services`.
- Given an agent host and a client secret typed in the app's field,
  when the person saves or replaces it,
  then the host is asked once with the account's ref and the secret, the listeners are told, and the secret appears in no answer, error or message.
- Given Google accepted a replaced client secret that another account of the workspace also uses,
  then the answer lists the addresses of this account and the other, also when the host fixed no account's refused mark.
- Given a check of a new client secret that couldn't finish,
  when the person replaces the secret,
  then it rejects in plain words that the old secret is still in use.
- Given a connector with no record and an agent host,
  when the person starts a setup for it,
  then the host is asked with the folder's key and the connector's id, and the record that results is listed as the connector's account.
- Given a record,
  when the person starts over,
  then the host removes it and a fresh record for the same connector and account type is started.
- Given an agent host that removed the record but can't start a fresh one,
  when the person starts over,
  then it rejects with a message that says the old setup was removed and a fresh one couldn't be made, with the host's reason, and the listeners are told to read again.
- Given no agent host,
  when the person saves a step, starts over or starts a sign-in,
  then it is refused as the engine not answering.
- Given an agent host that doesn't answer,
  when the person starts a sign-in,
  then it is refused as the engine not answering, not as a problem Halonic can't explain.
- Given an agent host that disconnects the account,
  when the person disconnects it,
  then the host is asked once with the account's ref, the answer says whether Google ended the sign-in, and the listeners are told.
- Given an agent host that can't disconnect,
  when the person disconnects the account,
  then it rejects with a message that says it couldn't finish and doesn't say what was removed, and the listeners are told to read again.
- Given a record whose client secret another account in Acme also uses,
  then the account lists that account's address as sharing its client.
- Given an agent host that refuses the sign-in with 409 "Save the client ID and the client secret first.",
  when the person starts the sign-in,
  then it rejects with kind `conflict` and those words, and the listeners are told to read again.
