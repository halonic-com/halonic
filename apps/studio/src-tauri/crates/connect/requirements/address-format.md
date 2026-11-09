# studio.src-tauri.crates.connect.address-format

- Status: draft
- Since: 0.1.0
- Source: HAL-1140, HAL-1375 (flow-install-update 5.3)

When the user enters an address, the connect check shall ignore spaces around it, add `http://` when it has no scheme, and accept a host name, an IPv4 address or an IPv6 address in brackets, each with an optional port. If the address has a path, a query, a user name, another scheme, a bad port or a malformed host, then the check shall report "not an address" before any network call. When the app shows an address back to the user, it shall leave out `http://` and the scheme's own port.

## Examples

- Given the input `  192.168.1.20:4280  `,
  when it is checked,
  then the address is `http://192.168.1.20:4280`.
- Given the input `[fd00::20]:4280`,
  when it is checked,
  then the address is `http://[fd00::20]:4280`.
- Given the input `192.168.1.20:4280/studio`, `ftp://192.168.1.20` or `fd00::20`,
  when it is checked,
  then the result is "not an address".
- Given the input `http://192.168.1.20:4280/` or `https://halonic.example`,
  when it is shown back,
  then it reads `192.168.1.20:4280` or `https://halonic.example`.
