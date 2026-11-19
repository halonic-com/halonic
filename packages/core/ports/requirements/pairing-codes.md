# ports.pairing-codes

- Status: active
- Since: unreleased
- Source: tunnel phase B build plan, decisions 2, 5 and 14 (HAL-12232, HAL-12353); tasks HAL-12235 and HAL-12360; ADR "Pairing and the end-to-end session"

The pairing codes shall use the 31 symbols `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, without 0, O, 1, I or L. A pairing code shall be 12 symbols, made from cryptographic random bytes with each byte of 248 or more skipped so every symbol is equally likely, and shown in three groups of four; when 8 draws of 16 bytes don't give 12 symbols, making it shall fail, because the source is broken. A typed code shall be read with ASCII whitespace (space, tab, line feed, form feed, carriage return), dots, dashes and middle dots dropped, refused if anything left isn't printable ASCII, then read in any case, and refused unless it is then exactly 12 symbols of the alphabet. Reading a check code follows the same rule with 6 symbols. The psk input shall be the code's ASCII bytes, for HKDF-SHA256 with an empty salt and the info `halonic pair psk v1`.

A check code shall be 6 symbols made from 8 HKDF-SHA256 bytes of the handshake hash (empty salt, info `halonic pair check v1`), read as an unsigned 64-bit big-endian number, reduced mod 31⁶ and written most significant symbol first, shown as `4F7 · 2KQ`.

A pairing QR code's text shall be `halonic-pair:` and base64url, without padding, of a record of the version (1), the host's 32-byte key, the code as one base-31 number in 8 bytes, the host name (a length byte and at most 32 bytes of UTF-8, cut at a whole character) and 1 to 3 endpoints (a count, then an entry each). An endpoint shall be given as a URL in its canonical form: `tcp://`, `wss://` or `https://`, an IPv4 address without leading zeros or a lower-case ASCII host name of at most 253 characters whose last label starts with a letter, and a port only when it isn't the scheme's default (443 for `wss:` and `https:`; a `tcp:` endpoint always has one), with nothing after it. Writing shall refuse any other form, IPv6 addresses among them. Its entry shall be a kind byte (the scheme in the two low bits, 0 `tcp`, 1 `wss`, 2 `https`; bit 2 for a host name instead of IPv4; bit 3 when the name's final `.ts.net` is left off; bit 4 when a port follows; the other bits zero), then the 4 bytes of the IPv4 address or a length byte and the host name, then the port in 2 bytes, big-endian, when it isn't the default. The text shall be at most 150 bytes, so it fits a version 8 QR code at level M; an endpoint that doesn't fit shall be left out, keeping the order given, and a LAN and a Tailscale IPv4 endpoint shall always fit together. Reading shall accept exactly what writing gives and nothing else, and give the endpoints back as the URLs written. Every case in `src/golden/pairing-vectors.json` shall pass on the host and on the phone.

## Examples

- Given the random bytes of a vector,
  when a pairing code is made from them,
  then it is the vector's code, shown in groups of four, with the vector's psk.
- Given the typed text " xx7a-9q36.kfb3 ",
  when it is read as a pairing code,
  then it is `XX7A9Q36KFB3`.
- Given a typed code with a 0, an O, a 1 or the wrong length,
  when it is read,
  then it is refused.
- Given a typed code with a character outside ASCII, such as `ſ`, which uppercases to `S`, or a no-break space,
  when it is read,
  then it is refused.
- Given a random source that only gives bytes of 248 or more,
  when a pairing code is made from it,
  then making it fails after 8 draws.
- Given a vector's handshake hash,
  when its check code is made,
  then it is the vector's check code.
- Given a payload with a 100-byte host name and four endpoints,
  when its QR text is written,
  then it is at most 150 bytes, which fits a version 8 QR code at level M.
- Given a 32-byte host name and the endpoints `tcp://192.168.178.23:4100`, `tcp://100.64.0.7:4100` and `wss://workstation.tail1234.ts.net:4100`,
  when its QR text is written,
  then it keeps the LAN and the Tailscale IPv4 endpoint and leaves out the name, which doesn't fit.
- Given an endpoint `tcp:192.168.1.20:4100`, `wss://studio.tail1234.ts.net:443`, `wss://Studio.example.net` or `tcp://[fd7a:115c:a1e0::1]:4100`,
  when a QR text is written with it,
  then writing is refused.
- Given a QR text with padding, another version, a code past 31¹², a missing or extra byte, or an endpoint entry with an unused bit, a default port written out or a name still ending in `.ts.net`,
  when it is read,
  then it is no payload.
