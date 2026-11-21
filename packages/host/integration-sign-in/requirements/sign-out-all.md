# integration-sign-in.sign-out-all

- Status: active
- Since: unreleased
- Source: HAL-14850 (Liam's security review of halonic#4276: removing a plugin's trust or the plugin signs out its sign-ins)

The host shall sign out every sign-in of an integration that has a saved grant, found from the saved grants and never from the sheet, so that it works when the sheet no longer has the sign-in or can't be read: each sign-in is revoked at the address the person approved, where there is one, and its grant is removed whether or not the revoke succeeded. Afterwards, and when asked to forget an integration, the host shall drop that integration's parts, so a pending sign-in of it ends and the next use builds them anew; the grants stay when it only forgets. For an integration the app doesn't name it shall sign out nothing. A process that runs no refresh of the grants, such as the CLI, shall sign out the saved sign-ins the same way, over https only.

## Examples

- Given a signed-in sign-in whose approved sign-in has a `revokeUrl`,
  when every sign-in is signed out,
  then the refresh token is sent to that address, the result says `revoked` and no grant is left.
- Given a plugin that lost its trust, so neither its sheet nor its client secret can be read,
  when every sign-in is signed out,
  then nothing is sent, the result says `notConfirmed` and no grant is left.
- Given a grant for a sign-in the sheet no longer has,
  when every sign-in is signed out,
  then that grant is found and removed.
- Given a sign-in that was started and not finished,
  when every sign-in is signed out,
  then its callback gets the plain 400 page and the integration's new parts say `signedOut`.
- Given an integration the app doesn't name,
  when every sign-in is signed out,
  then nothing is signed out and the saved grants stay.
- Given a signed-in integration,
  when the host forgets it,
  then its parts are new and its grant stays.
- Given the CLI signs out a saved sign-in,
  then the revoke goes to the approved `https` address and the grant is removed; given an approved address that isn't `https`, nothing is sent, the result says `notConfirmed` and the grant is removed.
