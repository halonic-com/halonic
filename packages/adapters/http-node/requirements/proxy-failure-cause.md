# http-node.proxy-failure-cause

- Status: active
- Since: unreleased
- Source: HAL-12606 (a proxy failure read as "check your internet connection")

When a request that has to go through the proxy fails, the Node transport's `ProxyError` shall carry a typed cause the engine reads (`kind` and `failureCause`): the code `proxy.<problem>`, where the problem is `setting`, `unreachable`, `timeout`, `refused`, `credentials`, `plain-http`, `insecure` or `bad-host`, and as detail the variable the proxy came from, the proxy as `http://host:port`, the host the request was for and the proxy's status when it refused. Neither the cause nor the message shall hold the proxy's user name or password.

## Examples

- Given `HTTPS_PROXY=socks5://proxy.corp:1080`,
  when a request to a public host is sent,
  then it fails with the code `proxy.setting` and the variable `HTTPS_PROXY`.
- Given a proxy that isn't running,
  when a request is sent,
  then it fails with `proxy.unreachable`, naming the proxy and the host.
- Given a proxy that answers CONNECT with 403,
  when a request is sent,
  then it fails with `proxy.refused` and the status `403`.
- Given a proxy set in `https_proxy` and a public `http://` URL,
  when a request is sent,
  then it fails with `proxy.plain-http` and the variable `https_proxy`.
