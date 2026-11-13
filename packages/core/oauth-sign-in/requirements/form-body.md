# oauth-sign-in.form-body

- Status: active
- Since: 0.1.0
- Source: HAL-8323 (HAL-984 design, section 4)

The sign-in shall write a token request's form as `application/x-www-form-urlencoded` exactly as `URLSearchParams` would, in the order of the fields, because the core has no `URLSearchParams` value to do it with.

## Examples

- Given the fields `scope` = `a b+c` and `redirect_uri` = `http://127.0.0.1:8787/oauth/callback`,
  then the body is `scope=a+b%2Bc&redirect_uri=http%3A%2F%2F127.0.0.1%3A8787%2Foauth%2Fcallback`, the same as `URLSearchParams` gives.
- Given no fields,
  then the body is empty.
