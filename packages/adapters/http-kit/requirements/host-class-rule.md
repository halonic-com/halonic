# http-kit.host-class-rule

- Status: active
- Since: 0.1.0
- Source: HAL-983 (I5 design, HAL-958 section 3.8)

When a request goes to a host whose class the sheet declares, the address rule shall allow an address only when it is in that same class: a public host only public addresses, a home-network host only private addresses, a host on this computer only loopback addresses.

## Examples

- Given a public host,
  when its answer holds `93.184.215.14` and `10.0.0.5`,
  then only `93.184.215.14` is allowed (attack case A28).
- Given a home-network host the user typed,
  when its answer is public or link-local,
  then the address is refused (attack case A9).
- Given a host on this computer,
  when its answer is `127.0.0.1` or `::1`,
  then the address is allowed; `0.0.0.0` and `::ffff:127.0.0.1` are refused.
