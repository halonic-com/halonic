# google-setup.refresh-refused

- Status: active
- Since: 0.1.0
- Source: HAL-709 (build plan B4; design 5.2; HAL-1107, HAL-1106)

When Google refuses a token refresh, the setup records shall save the refusal in the account's record as `refreshRefused`, holding only a fixed reason (`client`, `sign-in` or `client-gone`) and the time, and `mayRefresh` shall be `false` for that record, so no run refreshes again: no retry loop. `invalid_grant` shall save `sign-in` on that account only. A finished sign-in shall clear the account's own refusal; the passing of time shall not. A record without the key shall read as not refused, and one with a malformed value shall be damaged. A later refusal shall never move an account to a reason that needs less to fix, in the order `client`, `sign-in`, `client-gone`, and an unchanged reason keeps its first time. Nothing from Google's answer other than the refusal's kind shall be written.

## Examples

- Given a signed-in account,
  when its refresh is refused with `invalid_grant`, then it holds `sign-in`, `mayRefresh` is `false`, and after a new sign-in it is `true` again.
- Given an account that holds `client-gone`,
  when a refresh is refused with `invalid_client` again, then it still holds `client-gone` with its first time.
- Given a refusal whose `error_description` echoes the refresh token,
  then the record store's log doesn't hold it.
