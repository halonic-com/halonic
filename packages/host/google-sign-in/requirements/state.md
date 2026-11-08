# google-sign-in.state

- Status: active
- Since: 0.1.0
- Source: HAL-699 (plan approved by Liam; security points agreed in HAL-718)

The sign-in shall make each OAuth `state` from 32 bytes of cryptographically secure randomness, written as 43 base64url characters, shall compare a returned `state` with the expected one in time that doesn't depend on where they differ, and shall treat a missing or empty `state` as no match.

## Examples

- Given the platform's randomness,
  when two `state` values are made,
  then each is 43 base64url characters and they differ.
- Given an expected `state`,
  when the callback brings the same text,
  then it matches; when it brings one changed character, a shorter or longer text, an empty text or no `state`,
  then it doesn't.
- Given a random source that returns 33 bytes,
  when a `state` is made,
  then it fails and no `state` is made.
