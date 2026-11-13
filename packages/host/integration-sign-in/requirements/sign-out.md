# integration-sign-in.sign-out

- Status: active
- Since: 0.1.0
- Source: HAL-8588 (HAL-984 design, section 4, "Revoking and signing out")

The host shall wait for a refresh in flight before it revokes and removes the grant, so a refresh that ends late can't save its rotated refresh token and sign the user in again. While a sign-out runs, the kit's tokens shall give nothing for that sign-in, so no new refresh starts. Then it shall drop the access token in use, so the next request asks the user to sign in.

## Examples

- Given a refresh waiting for the server,
  then sign-out sends nothing until the refresh has ended, then revokes the refresh token the refresh saved and removes the grant.
- Given a sign-out that is running,
  then `access` throws `SignInNeededError` and sends no refresh.
- Given a sign-out that is running and a second one for the same sign-in,
  then the second gets the first one's result and the server is asked once.
- Given a signed-out sign-in,
  then `access` throws `SignInNeededError`.
- Given a sign-in nobody signed in to,
  then sign-out says `notSignedIn` and sends nothing.
