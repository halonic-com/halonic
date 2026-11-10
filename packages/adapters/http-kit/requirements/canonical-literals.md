# http-kit.canonical-literals

- Status: active
- Since: 0.1.0
- Source: HAL-983 (I5 design, HAL-958 attack case A11)

The address parser shall read only the canonical text a DNS answer or `URL.hostname` gives, and shall refuse every other spelling of an address, so that no second spelling of an address can be classified differently from the first.

## Examples

- Given the loose IPv4 forms `2130706433`, `0177.0.0.1`, `0x7f000001` and `127.1`, or an IPv6 address with a zone ID,
  when they are parsed,
  then the parser refuses them and `classifyAddress` throws a `RangeError`.
- Given the same loose forms in a URL (`https://2130706433/`),
  when `URL` has read the host,
  then the host classifies as `loopback`, not `public`.
