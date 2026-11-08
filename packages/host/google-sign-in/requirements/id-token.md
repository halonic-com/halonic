# google-sign-in.id-token

- Status: active
- Since: 0.1.0
- Source: HAL-699 (plan section 3; HAL-718, Julian's review of #273)

When the sign-in reads the e-mail from the ID token in Google's token answer, it shall accept the token only when `iss` is Google, `aud` is the sign-in's client ID or a list holding only it, `exp` is later than the `Clock`'s time, `email_verified` is boolean `true` and `email` and `sub` are present, and shall otherwise refuse it without saying what it held.

## Examples

- Given a token for another client ID,
  then it is refused.
- Given a token whose `email_verified` is the text `"true"`,
  then it is refused.
- Given text that isn't a JWT,
  then it is refused.
