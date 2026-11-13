# oauth-sign-in.sign-in-token-name

- Status: active
- Since: 0.1.0
- Source: HAL-8323 (HAL-984 design, section 4, "Keeping tokens")

The sign-in shall keep a sign-in's refresh token under the token name `s<length>_<integration>_<sign-in>`, where `<length>` is the length of the integration's name, and shall throw a `RangeError` for a name that isn't lower-case words joined by `-` and for a result longer than 128 characters.

## Examples

- Given the integration `gitlab` and the sign-in `work-account`,
  then the name is `s6_gitlab_work-account`.
- Given the integration `a-b` with the sign-in `c`, and the integration `a` with the sign-in `b-c`,
  then the two names differ.
- Given a name with an upper-case letter or a `_`,
  then it throws a `RangeError`.
