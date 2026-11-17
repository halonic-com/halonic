# std.url-host

- Status: active
- Since: unreleased
- Source: HAL-63 requirements (the `std` host parser, B3 and B4), for the Models budget rules (HAL-1292)

The URL host reader shall give the host of an `http` or `https` URL as a domain name, an IPv4 address or an IPv6 address, reading the number forms and brackets of the WHATWG URL rules, and shall give nothing for any URL or host it does not fully understand, so that a caller which needs a safe answer treats it as unknown.

## Examples

- Given `http://LOCALHOST.:11434`, when its host is read, then it is the domain `localhost`.
- Given `http://127.1:8080`, `http://2130706433` or `http://0x7f.0.0.1`, when the host is read, then it is the IPv4 address 127.0.0.1.
- Given `http://[::1]:8080`, when the host is read, then it is the IPv6 address `::1`.
- Given `http://localhost@evil.example`, when the host is read, then it is the domain `evil.example`, because `localhost` is user info.
- Given `http://[::ffff:127.0.0.1]`, when the host is read, then it is an IPv6 address, not an IPv4 one.
- Given `ftp://x`, `http://`, `http://999.1.1.1`, `http://a b` or text that is not a URL, when the host is read, then there is no host.
