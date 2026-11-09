# google-sign-in.service-checks

- Status: active
- Since: 0.1.0
- Source: HAL-708 (build plan B3; design 3.5 point 3, section 6 item 7)

When a sign-in has saved the refresh token, it shall, before returning, check each ticked service in the services' order, one after the other: `scopeNotGranted` with the missing scopes, without a request, when Google didn't grant all its `googleScopes`; `allowed`, without a request, when its sheet has no `googleCheck`; otherwise the result of `readGoogleCheckAnswer` for its check's answer, with the setup's project ID, or `unreachable` when the check got no answer. Each result shall carry the service id and the time from the `Clock`.

## Examples

- Given Drive (no check) and Gmail (a check that answers 403 `SERVICE_DISABLED`), and the project ID `halonic-x1`,
  then the results are Drive `allowed` and Gmail `apiOff` with the Gmail API's Enable link in `halonic-x1`.
- Given the user unticked Gmail's scope, then Gmail is `scopeNotGranted` and no check is sent.
- Given a check that times out, then the service is `unreachable` and the refresh token is still saved.
