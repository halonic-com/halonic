# google-setup.sign-in.loopback-redirect

- Status: active
- Since: 0.1.0
- Source: HAL-699 (plan section 3, Liam's review)

The sign-in shall build its redirect URI as `http://127.0.0.1:<port><path>` only, and shall refuse a port outside 1 to 65535 and a path that doesn't start with `/`, holds `//` or `..`, or has any character other than letters, digits and `-._~/`, so it can never carry a query string or fragment.

## Examples

- Given port 8787 and path `/google/callback`,
  when the redirect is built,
  then it is `http://127.0.0.1:8787/google/callback`.
- Given path `/callback?next=/evil`, `/callback#x` or `//evil.example.com/cb`,
  when the redirect is built,
  then it fails with a `RangeError`.
