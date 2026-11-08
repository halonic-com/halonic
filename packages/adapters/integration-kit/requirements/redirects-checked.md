# integration-kit.redirects-checked

- Status: active
- Since: 0.1.0
- Source: HAL-135 (no redirects to undeclared hosts)

The kit shall follow redirects itself and check every hop like the first request. A secret not allowed for the new host, and origin-bound headers when the origin changes, shall not be sent on.

## Examples

- Given a redirect from `api.example.com` to declared `cdn.example.com`,
  when the integration placed `example-key` and its own `authorization` header,
  then the second request carries neither.
- Given a redirect to an undeclared host, to `http` or to a file,
  when the kit sees it,
  then it throws and sends nothing more.
- Given a 303 after a POST,
  when the kit follows it,
  then the next request is a GET without a body; after a 307 it stays a POST with its body.
- Given more redirects than the limit,
  when the kit follows them,
  then it throws `too-many-redirects`.
