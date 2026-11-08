# google-setup.looks-like-client-secret

- Status: active
- Since: 0.1.0
- Source: HAL-698 (build plan A1; design 4.2 and 5.1)

When text holds `GOCSPX-` at the start of a word, followed by at least one letter, digit, `_` or `-`, `looksLikeGoogleClientSecret` shall return true; otherwise it shall return false.

## Examples

- Given `my secret is GOCSPX-abc123, keep it`, then it returns true.
- Given a client ID such as `1234-abc.apps.googleusercontent.com`, then it returns false.
- Given the bare prefix `GOCSPX-` followed by a space, or `xGOCSPX-abc123`, then it returns false.
