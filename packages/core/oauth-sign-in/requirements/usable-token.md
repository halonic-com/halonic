# oauth-sign-in.usable-token

- Status: active
- Since: 0.1.0
- Source: HAL-8323 (HAL-984 design, section 4)

The sign-in shall keep and place an access token or refresh token only when it is visible ASCII with no space or line break and at least 16 and at most 4096 characters, because a shorter token would make the secret filter remove that text from every answer, and a longer value is no token: real tokens have a few hundred to about two thousand characters, a server refuses a header much over 8 KiB, and a hostile provider must not make the host hold and save huge values.

## Examples

- Given `x`, a token with a space, a line break or a character outside ASCII, 15 characters or 4097 characters,
  then it isn't usable.
- Given 16 or 4096 visible ASCII characters,
  then it is.
