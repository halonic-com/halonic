# google-setup.sign-in.expiry

- Status: active
- Since: 0.1.0
- Source: HAL-699 (plan D5, HAL-705)

A pending sign-in shall be kept in memory only, at most one per account, and shall count as expired, so that the callback can't finish it, from 10 minutes after its start by the `Clock`.

## Examples

- Given a sign-in started at 12:00,
  when the callback comes at 12:09:59.999,
  then it can still finish.
- Given the same sign-in,
  when the callback comes at 12:10,
  then the result is `linkNoLongerValid`.
