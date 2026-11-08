# google-setup.sign-in.callback-state

- Status: active
- Since: 0.1.0
- Source: HAL-699 (plan section 3; HAL-718 A and B)

When Google's callback arrives, the sign-in shall first find and remove the pending sign-in whose `state` matches, and only then read `error` or `code`; when no unexpired pending sign-in matches, or `state` is missing, it shall return `linkNoLongerValid`, read nothing else and leave in place every pending sign-in whose `state` didn't match. An expired match is removed.

## Examples

- Given a pending sign-in,
  when a callback brings its `state` and a code,
  then the result holds the code and the pending sign-in, and it is removed.
- Given the same callback a second time,
  then the result is `linkNoLongerValid`.
- Given a pending sign-in,
  when a callback brings `error=access_denied` with another `state` or none,
  then the result is `linkNoLongerValid` and the pending sign-in is still there.
