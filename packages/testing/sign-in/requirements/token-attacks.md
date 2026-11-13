# sign-in.token-attacks

- Status: active
- Since: 0.1.0
- Source: HAL-8618 (HAL-984 design, section 8: attack cases T11, T13, T15, T17, T18 and T22)

The sign-in tokens shall use a saved grant only for the sign-in the user approved, and shall treat a provider as hostile: a grant whose approved sign-in differs from the sheet and settings now, however they changed, is never refreshed and the user is asked to sign in again; sign-out revokes at the approved revoke URL with the approved client and never at the sheet's; however many requests need a token at once one refresh runs, and a late 401 for a replaced token forces none; a 401 forces a refresh at most once in 30 seconds, never for a token that is not the current one, and never makes the user sign in again; and a provider that rotates refresh tokens and detects reuse never sees a retired one, because the rotated token is saved before the new access token is used and a sign-out waits for a refresh in flight.

## Examples

- Given a saved grant and a sheet whose token URL, authorize URL, revoke URL, scopes, client ID, client authentication, access hosts or placement changed, a setting that changed the client ID, or a sheet that no longer has the sign-in,
  when a token is asked for,
  then the request is refused as needing a sign-in and the provider is sent nothing.
- Given a saved grant whose sheet has since changed its revoke URL and client authentication,
  when the user signs out,
  then the revoke goes to the approved URL with the approved client authentication, nothing goes to the new URL, and the grant is removed.
- Given a grant that was edited in the store or is not a grant,
  when a token is asked for,
  then the grant is removed and the provider is sent nothing.
- Given eight requests at once with no usable token,
  then exactly one refresh runs; and given the same when the token is about to expire, exactly one more.
- Given a request whose 401 arrives after its token was replaced by a refresh,
  then it forces no refresh, even when the new token is old enough for a 401 to count.
- Given a server that answers 401 to every token,
  then no refresh follows within 30 seconds of the token's issue, one follows after that, none for the new token's 401, and the grant is kept.
- Given a provider that answers `invalid_grant` to a refresh,
  then the request is refused as needing a sign-in and the grant is removed.
- Given a provider that rotates refresh tokens and detects reuse,
  when requests come at once and over many rounds,
  then each refresh presents a token no refresh presented before, the rotated token is saved before the first request that uses the new access token, and the grant is never revoked.
- Given a rotated refresh token that is not fit to save,
  then the saved grant stays as it was.
- Given a sign-out while a refresh is running,
  then no grant is left, the rotated token is revoked at the provider and the next request is refused as needing a sign-in.
