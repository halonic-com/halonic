# integration-sign-in.approved-sign-ins

- Status: active
- Since: 0.1.0
- Source: HAL-8588 (HAL-984 design, sections 4 and 6)

The host shall fill in an integration's sign-ins with `approvedSignIns(sheet, settings)`, reading the sheet and the settings each time a sign-in is looked at and never keeping them, say which setting is wrong when the settings can't fill a sign-in in, and give the kit a token only for the sign-in the sheet and the settings describe now. The kit's view of the tokens shall have no way to forget a token or wait for a refresh.

## Examples

- Given a sheet with a sign-in whose client ID is a setting and a settings value for it,
  then looking the sign-in up gives the sign-in with the client ID, the URLs, the scopes and the access hosts filled in.
- Given the setting is missing,
  then the lookup says `settingsInvalid` with the problem, and not a half-filled sign-in.
- Given a name the sheet doesn't have,
  then the lookup says `unknown`.
- Given a saved grant and a changed client ID setting,
  then `access` throws `SignInNeededError` and no request is sent.
- Given the kit's tokens, then their keys are `access`, `rejected` and `filterValues` only.
