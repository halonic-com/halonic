# http-node.proxy-guard

- Status: active
- Since: unreleased
- Source: HAL-6640 (proxy design, sections 2.4 and 2.5, attack cases 3, 5, 8 and 9)

When a proxy is set, the Node transport shall decide for each request and each redirect hop, by the host's class and name, whether it goes through the proxy: a `loopback` or `private` host and a host on `NO_PROXY` shall go direct with the full address check, a public `https` host shall go through the proxy, and a public plain `http` host or an unusable proxy setting shall fail the request with a plain message, never direct. A proxy on one of Halonic's own ports shall be refused.

## Examples

- Given a proxy and a `loopback` host,
  when a request is sent,
  then the proxy sees no CONNECT and the host answers.
- Given a proxy and a public host on `NO_PROXY` whose name resolves to a private address,
  when a request is sent,
  then it is refused by the address check and the proxy sees no CONNECT.
- Given a proxy and a public `http://` URL,
  when a request is sent,
  then it fails with advice to use `https://` or `NO_PROXY`, and nothing is sent.
- Given a proxied host that redirects to another origin,
  when the request follows,
  then a new CONNECT is made and the caller's `authorization` is not sent.
- Given a proxy whose port is one of Halonic's own ports,
  when a request is sent,
  then it is refused before any connection.
