# oauth-sign-in.sign-out

- Status: active
- Since: 0.1.0
- Source: HAL-8323 (HAL-984 design, section 4, "Signing out")

The sign-in shall on sign-out revoke the saved refresh token at the revoke endpoint of the sign-in the user approved, never at one from the sheet as it is now, with the client of that approved sign-in, unless the sign-out is for a new grant that the revoke would end too (the old approval says `revokeEndsClientGrants` and the new one has the same client, token server and revoke server), in which case no revoke is sent, and then remove the grant whether or not the server confirmed, and shall drop the access token in use so that it is not given out again.

## Examples

- Given a saved grant whose sheet has since changed its `revokeUrl`,
  then the revoke goes to the approved `revokeUrl` and the grant is removed.
- Given a server that answers 503 or can't be reached, or a client secret that is not set,
  then the result says `notConfirmed` and the grant is removed.
- Given an approved sign-in without a revoke endpoint,
  then nothing is sent, the result says `noRevokeUrl` and the grant is removed.
- Given an approved sign-in with `revokeEndsClientGrants` and a replacing approval with the same client and servers,
  then nothing is sent, the result says `skipped` and the grant is removed.
- Given that sign-in and a replacing approval with another client or server, or an old one without the flag,
  then the revoke is sent as usual.
- Given no saved grant,
  then the result is `notSignedIn` and nothing is sent.
- Given a sign-in that was signed out after a token was given out,
  then the next `access` does not return that token.
