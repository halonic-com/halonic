# http-node.proxy-config

- Status: active
- Since: unreleased
- Source: HAL-6640 (proxy design, sections 2.2 and 2.5, conditions C1 and C2)

When the environment names an `http://` proxy, `proxyFromEnv` shall return it with its `NO_PROXY` list, reading the lower-case variable before the upper-case one and treating an empty value as not set. A value that is set but unusable shall come back as a refusal with a plain message that never contains the user name or password, and the `NO_PROXY` list shall match a host by name, subdomain, port and IP literal, with no ranges.

## Examples

- Given `https_proxy` is empty and `HTTPS_PROXY` is `http://proxy.corp:3128`,
  when the environment is read,
  then the proxy is `proxy.corp:3128`.
- Given `HTTPS_PROXY` is a `socks5://` URL that carries a user name and password,
  when the environment is read,
  then it is refused and the message names `socks5` but not the password.
- Given `NO_PROXY` is `example.com,10.0.0.1:8443`,
  when `api.example.com` and `10.0.0.1` on port 8443 are asked,
  then both match, and `10.0.0.1` on port 443 doesn't.
