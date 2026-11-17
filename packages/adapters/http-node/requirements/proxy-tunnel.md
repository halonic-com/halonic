# http-node.proxy-tunnel

- Status: active
- Since: unreleased
- Source: HAL-6640 (proxy design, sections 2.3 and 2.6, attack cases 1, 2, 4, 6, 7 and 10, conditions C3 and C4)

When a request to a public `https` host has to go through the proxy, the Node transport shall ask the proxy for a CONNECT tunnel to the host's name and port, check the server's certificate for that name before it sends anything, and send the proxy's user name and password only on the CONNECT line. A proxy that answers anything but a clean 200, a tunnel that ends at the wrong server, and a proxy that is down or silent shall each fail the request with a message that holds no password, and the request shall never go direct instead.

## Examples

- Given a proxy that tunnels to the server for `model.test`,
  when a request goes to `https://model.test/`,
  then the proxy sees `CONNECT model.test:443` with the proxy credentials and ciphertext only, and the server sees neither the credentials nor a `proxy-authorization` header the caller set.
- Given a proxy that tunnels `model.test` to a server whose certificate is for another name,
  when a request is sent,
  then it fails before any request byte is sent, and the server sees none.
- Given a proxy that answers 407,
  when a request is sent,
  then the error says the proxy refused the user name and password, without the password.
- Given a proxy that sends bytes after its 200,
  when a request is sent,
  then it fails.
