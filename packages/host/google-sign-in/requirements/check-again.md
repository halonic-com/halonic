# google-sign-in.check-again

- Status: active
- Since: 0.1.0
- Source: HAL-708 (build plan B3; design 3.5 point 3, section 6 item 7; HAL-1056)

When Check again runs for an account, `checkGoogleServicesAgain` shall refuse with a `RangeError`, before reading or sending anything, a bad account ref, client ref or `googleCheck` URL (`google-sign-in.check-request`); shall return `refreshBlocked`, sending nothing, while the record holds a refused refresh; and otherwise shall send one refresh to Google's token endpoint with the saved refresh token and the client's ID and secret in the form body, redirects refused. When Google refreshes the token, it shall save a new refresh token if Google sent one, and shall check each ticked service as after sign-in (`google-sign-in.service-checks`), returning `checked` with the results. Otherwise it shall return `notSignedIn`, `noClientSecret`, `unreachable`, or the refresh answer's kind from `readRefreshAnswer` (`signInRefused`, `clientRefused`, `googleError`, `unexpectedAnswer`, also for a refresh without the granted scopes), and, unless Google sent a new refresh token with an access token, leave the saved refresh token as it was. It shall keep the client secret, the refresh token and the access token out of every result, every request URL and every `TokenStore` name, also when Google's answer or the `HttpClient`'s error echoes them.

## Examples

- Given a saved refresh token and Google refreshes it, with Gmail's API switched off,
  then the result is `checked` with Gmail `apiOff`, and the only requests are the refresh and Gmail's check.
- Given the record holds a refused refresh,
  then the result is `refreshBlocked` and nothing goes to Google.
- Given Google answers the refresh with `invalid_grant`,
  then the result is `signInRefused`, no check is sent and the saved refresh token is unchanged.
- Given Google sends a new refresh token with the refresh,
  then it replaces the saved one.
- Given Google sends a new refresh token but no granted scopes,
  then the result is `unexpectedAnswer`, no check is sent and the new token replaces the saved one.
