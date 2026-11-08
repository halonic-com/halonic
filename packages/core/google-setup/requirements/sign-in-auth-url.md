# google-setup.sign-in.auth-url

- Status: active
- Since: 0.1.0
- Source: HAL-699 (plan section 3, Liam's review)

The sign-in shall send the browser to Google's auth endpoint with the code flow, the loopback redirect, `state`, the PKCE challenge with method `S256`, `access_type=offline` and `prompt=consent`, the scopes `openid` and `email` plus the ticked services' scopes sorted and without duplicates, and `login_hint` only when the account's e-mail is known; it shall never send `include_granted_scopes`, the PKCE verifier or the account ref.

## Examples

- Given the Gmail scope and no known e-mail,
  when the auth URL is built,
  then its scope is `email <gmail> openid` and it has no `login_hint`.
- Given the e-mail `account@example.com`,
  when the auth URL is built,
  then `login_hint` is that e-mail.
- Given a `state` that holds `&prompt=none`,
  when the auth URL is built,
  then it is encoded and `prompt` stays `consent`.
