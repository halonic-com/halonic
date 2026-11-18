# Decision: QR endpoints become short binary entries

- Approval: Paperclip task HAL-12360, building decision 14 (option B) recorded on HAL-12353, under the HAL-12235 note `decisions/liam/HAL-12235-pairing-codecs.md`; Liam wrote it, Julian reviews and signs this note as the security reviewer
- Kind: internal

In the pairing QR record, each endpoint was a length byte and its URL as text. That left room for
one address only, so a phone paired at home never learned the Tailscale address it needs away
from home. Each endpoint is now a short entry: a kind byte (scheme, IPv4 or name, a `.ts.net`
suffix bit, a port bit), then 4 bytes of IPv4 or a length byte and the name, then 2 bytes of port
when it isn't the scheme's default. A LAN and a Tailscale IPv4 address take 7 bytes each and always
fit; a Tailscale name usually fits after them. The QR code stays version 8 and the tile stays the
same size, so nothing changes for the user.

- `ports.pairing-codes`, writing: the `endpoints` stay URLs, but only in one canonical form
  (`tcp://`, `wss://` or `https://`, an IPv4 address or a lower-case host name, a port only when it
  isn't the default). Any other form throws, IPv6 addresses among them, so the host can't hand the
  phone something that reads back differently.
- `ports.pairing-codes`, reading: an entry is accepted only when it is exactly the entry writing
  gives for the URL it reads as, so unused bits, a default port written out, port 0 and a name still
  ending in `.ts.net` are refused, and each QR text has one meaning.
- The record stays version 1: nothing has been released and the phone's parser (D3, HAL-12246)
  hasn't started, so it starts from this format.
- `pairing-vectors.json`: the QR cases now use the entries (LAN, Tailscale IPv4 and a Tailscale
  name; a 32-byte host name that drops the name; default ports left out), and gain
  `qrEndpointsRefused` and `qrTextsRefused` for the phone's tests.

## Covers

- ports.pairing-codes
- packages/core/ports/src/golden/pairing-vectors.json
