# google-setup.sign-in-open-again

- Status: active
- Since: 0.1.0
- Source: HAL-699 (plan D7)

While an account's pending sign-in is still valid, "Open again" shall return the same auth URL, so that the same `state` and verifier still finish it; "Cancel" shall drop the pending sign-in, so that its callback can't finish it.

## Examples

- Given a sign-in started at 12:00,
  when the user presses "Open again" at 12:05,
  then they get the auth URL from 12:00, and a callback from the first tab still finishes the sign-in.
- Given the same sign-in,
  when the user presses "Open again" at 12:10,
  then there is no URL to reuse, and the user starts a new sign-in.
- Given a sign-in that was cancelled,
  when its callback comes,
  then the result is `linkNoLongerValid`.
