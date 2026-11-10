# http-node.redirect-hops

- Status: active
- Since: 0.1.0
- Source: HAL-983 (I5 design, HAL-958 attack case A29)

The Node transport shall pass `redirect` through: with `manual` it shall return the redirect as it is, with `error` it shall throw, and with `follow` it shall check the class and every address again on each hop and drop origin-bound headers when the origin changes.

## Examples

- Given an allowed host that redirects to a host whose answer is private, with `follow`,
  when a request is sent,
  then the hop is refused with `address-not-allowed` and nothing reaches the second address.
- Given a redirect, with `manual`,
  when a request is sent,
  then the `3xx` response comes back with its `location`.
