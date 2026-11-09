# google-setup.sign-in-account-match

- Status: active
- Since: 0.1.0
- Source: HAL-708 (build plan B3; design 3.5 point 3, section 6 item 6)

When the connector's address and the verified address from the sign-in are the same after trimming spaces and ignoring letter case, `accountMatches` shall return true. Otherwise, including when the connector's address is empty, it shall return false. It shall not fold Gmail dots or a `+` suffix.

## Examples

- Given `Someone@Example.com ` and `someone@example.com`, then it returns true.
- Given `someone@example.com` and `other@example.com`, then it returns false.
- Given `someone@example.com` and `some.one@example.com` or `someone+x@example.com`, then it returns false.
