# oauth-sign-in.usable-token

- Status: active
- Since: 0.1.0
- Source: HAL-8323 (HAL-984 design, section 4)

The sign-in shall keep and place an access token or refresh token only when it is visible ASCII with no space or line break and at least 16 characters, because a shorter token would make the secret filter remove that text from every answer.

## Examples

- Given `x`, a token with a space, a line break or a character outside ASCII, or 15 characters,
  then it isn't usable.
- Given 16 visible ASCII characters,
  then it is.
