# oauth-sign-in.sign-in-tokens

- Status: active
- Since: 0.1.0
- Source: HAL-8323 (HAL-984 design, sections 4 and 5, "Using a token" and "When the server says no")

The sign-in shall give the access token of a sign-in, valid for at least 60 more seconds, with one refresh per sign-in however many requests wait for it, saving a rotated refresh token before the new access token is used, shall refresh because of a 401 only when the rejected value is the current token and at least 30 seconds old, shall throw `SignInNeededError` and remove the grant only when nothing current is saved or the server answered `invalid_grant`, shall list every access token not yet expired, the refresh token and the client secret for the secret filter, and shall say when no refresh of a sign-in is running any more (`settled`), so a sign-out can wait for it.

## Examples

- Given eight requests that need a token at once,
  then one refresh request is sent and all eight get its token.
- Given a refresh answer with a new refresh token,
  then the grant holds it before `access` returns.
- Given a 401 for the current token that is older than 30 seconds,
  then the next `access` refreshes; given one for an older token, or for a token under 30 seconds old, then it doesn't.
- Given no saved grant, a grant approved for another sign-in, or `invalid_grant`,
  then `access` throws `SignInNeededError`, and for `invalid_grant` the grant is removed.
- Given a network failure,
  then the error is not `SignInNeededError` and the grant stays.
- Given a refresh in flight, when `settled` is called,
  then it resolves after the refresh ended, also when the refresh failed; with no refresh running it resolves at once.
