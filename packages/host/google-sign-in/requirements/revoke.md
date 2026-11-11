# google-sign-in.revoke

- Status: active
- Since: 0.1.0
- Source: HAL-699 (plan section 3; routes doc section 2)

When an account is disconnected, the sign-in shall send its refresh token to Google's revoke endpoint in the form body, never in the URL, refusing redirects and waiting 10 seconds at most for Google, and shall remove the token from the `TokenStore` whether Google confirms, refuses or can't be reached, saying in the result whether Google confirmed.

## Examples

- Given Google answers 200,
  then the result is `disconnected` with `googleConfirmed` true and the token is gone.
- Given the network fails,
  then the token is still gone and `googleConfirmed` is false.
- Given Google doesn't answer within 10 seconds,
  then the token is still gone and `googleConfirmed` is false.
- Given no refresh token,
  then nothing is sent and the result is `nothingToRevoke`.
