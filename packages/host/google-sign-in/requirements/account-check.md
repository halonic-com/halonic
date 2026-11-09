# google-sign-in.account-check

- Status: active
- Since: 0.1.0
- Source: HAL-708 (build plan B3; design 3.5 point 3, section 6 item 6; HAL-1056)

When the ID token passes but its verified e-mail isn't the connector's address (`accountMatches`), the sign-in shall return `wrongAccount` with the address Google confirmed, and shall save nothing, run no check and revoke nothing. When Google hasn't verified the e-mail (`email_verified` isn't boolean `true`), the sign-in shall return `idTokenRefused` and save nothing, even when the address is the connector's.

## Examples

- Given the connector `account@example.com` and a sign-in as `other@example.com`,
  then the result is `wrongAccount` with `signedInAs: "other@example.com"` and only the token request was sent.
- Given a sign-in as `Account@Example.com`, then the result is `signedIn`.
- Given the connector's own address with `email_verified: false`, then the result is `idTokenRefused` and nothing is saved.
