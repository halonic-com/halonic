# studio.workspace-google-setup-accounts

- Status: active
- Since: 0.1.0
- Source: HAL-9378; Liam's decisions on HAL-9378 (connector link, workspace key)

When the desktop app opens a folder, it shall give the Google setup feature one account for each Google connector of the folder that has a setup record, with the address from the connector file, the services of the folder's integration sheets that ask for Google scopes, and the saved progress, found by the folder's workspace key and the connector id. It shall tell its listeners when a connector file changed and when the window comes to the front. It shall refuse every change to a setup, the client secret, Start over and Disconnect with a plain message until the desktop app can write them, and shall not change a record. The desktop app shall register the Google setup feature.

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
- Given a record whose client secret another account in Acme also uses,
  then the account lists that account's address as sharing its client.
