# format.integration-host-class

- Status: active
- Since: 0.1.0
- Source: HAL-3385; the design on HAL-1873, section 5 (Julian's option A on HAL-1939), approved by the board on HAL-1949

The format shall require a permission sheet's `{ fromSetting }` host in `hosts` to declare its class, `loopback`, `private` or `public`, so the trust check can say where it may go before the setting is filled in; a secret shall name such a host by its setting alone; and `integrationPolicy` shall refuse, as `setting-outside-class`, a setting whose URL's host is outside that class: `loopback` takes only `localhost`, `127.0.0.0/8` and `[::1]`; `private` only a private IP address (`10/8`, `172.16/12`, `192.168/16`, `fc00::/7`); `public` only a host name other than `localhost` and `*.localhost`, over `https`. An address in no class, such as link-local `169.254.0.0/16` or `[::]`, is refused by every class.

## Examples

- Given `hosts: [{ fromSetting: url }]` without a class, or with `class: anywhere`, when it is parsed, then it fails at `hosts[0]`.
- Given a secret whose host is `{ fromSetting: url, class: public }`, when it is parsed, then it fails with `unrecognized_keys`: the class sits in `hosts`.
- Given `class: loopback` and `url` set to `http://localhost:8080`, `http://127.0.0.2` or `https://[::1]:8443`, when the policy is resolved, then it passes; with `http://192.168.1.5` or `https://mcp.example.com`, it fails with `setting-outside-class`.
- Given `class: private` and `url` set to `http://192.168.1.5:8123` or `https://[fd12::1]`, when the policy is resolved, then it passes; with `http://localhost:8123`, `https://nas.example.com` or `https://[fe80::1]`, it fails with `setting-outside-class`.
- Given `class: public` and `url` set to `https://mcp.example.com`, when the policy is resolved, then it passes; with `https://localhost`, `https://app.localhost`, `https://10.0.0.7`, `https://8.8.8.8` or `https://[::]`, it fails with `setting-outside-class`, and with `http://mcp.example.com` with `plain-http-not-local`.
- Given `https://169.254.169.254` or `https://[::]`, when the policy is resolved under each class, then every class fails with `setting-outside-class`.
- Given a refused setting, when its problem is read, then the message names what the class allows and the host it got.
