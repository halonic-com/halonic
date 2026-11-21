# oauth-sign-in.sign-in-token-name

- Status: active
- Since: unreleased
- Source: HAL-8323 (HAL-984 design, section 4, "Keeping tokens")

The sign-in shall keep a sign-in's refresh token under the token name `s<length>_<integration>_<sign-in>`, where `<length>` is the length of the integration's name, and shall throw a `RangeError` for a name that isn't lower-case words joined by `-` and for a result longer than 128 characters. From the names a token store holds, as written or in its stored form, it shall give back the sign-ins of one integration, so that a sign-out can find every grant of an integration whose sheet it can no longer read.

## Examples

- Given the integration `gitlab` and the sign-in `work-account`,
  then the name is `s6_gitlab_work-account`.
- Given the integration `a-b` with the sign-in `c`, and the integration `a` with the sign-in `b-c`,
  then the two names differ.
- Given a name with an upper-case letter or a `_`,
  then it throws a `RangeError`.
- Given the token names `s6_gitlab_work_account`, `S6-GITLAB-HOME` and `s3_jira_work`,
  when the sign-ins of `gitlab` are read from them,
  then they are `home` and `work-account`.
- Given the token name `s1_a_b_c`,
  when the sign-ins of `a-b` are read from it,
  then there are none, and for `a` there is `b-c`.
