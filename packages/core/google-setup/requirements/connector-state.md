# google-setup.connector-state

- Status: active
- Since: 0.1.0
- Source: HAL-709 (build plan B4; design 5.2 and section 6 item 8)

The connector state shall be:

- **Needs sign-in again** for `signInRefused`, reopening at `sign-in` only, because signing in again keeps the client ID and the secret. It shall be the weekly end (`weeklyEnd`) only when the record says the personal app is in *Testing* and the refusal came 6½ to 7½ days after the last sign-in, both ends included (HAL-18664, design 5.2 row 3). A Workspace app is Internal and an app *In production* isn't in Testing, so neither is ever the weekly end.
- **Needs new secret** for `clientRefused`, reopening at `credentials`.
- **API off** for an API switched off during a run, reopening at `apis`, with the API and its Enable link only when Google named the API as `<name>.googleapis.com`, and with the record's project ID, or else the project Google named when it looks like a project ID or number.

No state shall hold a token, the client secret or Google's free text.

## Examples

- Given a personal app in *Testing*, last signed in 7 days ago,
  when the refresh is refused with `invalid_grant`,
  then the state is `needs-sign-in-again`, the weekly end, reopening at `sign-in`.
- Given the same account, last signed in 3 days ago, or the same timing with the record *In production*,
  then the state isn't the weekly end and reopens at `sign-in`.
- Given a run that fails with the Gmail API switched off and a record with project `acme-mail`,
  then the state is `api-off` with the Enable link for the Gmail API in `acme-mail`.
