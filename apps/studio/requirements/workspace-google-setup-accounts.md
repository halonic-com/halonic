# studio.workspace-google-setup-accounts

- Status: active
- Since: 0.1.0
- Source: HAL-9378; Liam's decisions on HAL-9378 (connector link, workspace key)

When the desktop app opens a folder, it shall give the Google setup feature one account for each Google connector of the folder that has a setup record, with the address from the connector file, the services of the folder's integration sheets that ask for Google scopes, and the saved progress, found by the folder's workspace key and the connector id. It shall tell its listeners when a connector file changed and when the window comes to the front. When the app has an agent host, Disconnect shall ask the host to end the account's sign-in and remove the setup, answer whether Google ended it, and tell its listeners; if the host can't, it shall reject in plain words that it couldn't finish, without claiming anything is left or gone, and still tell its listeners so they read the accounts again. It shall refuse every other change to a setup, the client secret and Start over, and Disconnect without an agent host, with a plain message until the desktop app can write them, and shall not change a record itself: the app's page never writes one. The desktop app shall register the Google setup feature.

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
- Given the person saves a step,
  then the save is refused with a message that says it can't be done in the app yet, and the record is unchanged.
- Given an agent host that disconnects the account,
  when the person disconnects it,
  then the host is asked once with the account's ref, the answer says whether Google ended the sign-in, and the listeners are told.
- Given an agent host that can't disconnect,
  when the person disconnects the account,
  then it rejects with a message that says it couldn't finish and doesn't say what was removed, and the listeners are told to read again.
- Given a record whose client secret another account in Acme also uses,
  then the account lists that account's address as sharing its client.
