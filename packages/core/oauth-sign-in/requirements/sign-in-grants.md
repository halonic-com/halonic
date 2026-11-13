# oauth-sign-in.sign-in-grants

- Status: active
- Since: 0.1.0
- Source: HAL-8323 (HAL-984 design, section 4, "Keeping tokens")

The sign-in shall keep a refresh token together with the sign-in the user approved and its hash in one token, and shall on every load report the grant as `stale` and never as `current` when the hash of the sign-in the sheet describes now differs from the saved one, and as `none`, removing the record, when what is saved can't be read or doesn't match its own hash.

## Examples

- Given a saved grant and the same approved sign-in on load,
  then the grant is `current` with its refresh token and approved sign-in.
- Given a saved grant and a sign-in whose `tokenUrl` or `revokeUrl` differs on load,
  then the grant is `stale`, and it still holds the approved `revokeUrl` for the sign-out.
- Given a saved record that isn't JSON, or whose approved sign-in was edited after it was saved,
  then the result is `none` and the record is removed.
- Given a refresh token that is too short or has a space,
  then saving throws a `RangeError` and nothing is written.
