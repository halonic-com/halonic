# Decision: a link in a plugin's Markdown answer shows its host

- Approval: Noah asked for this in his design check of the Studio kit pull requests
  ([design-check on HAL-4990](/HAL/issues/HAL-4990#document-design-check), drift 3); Liam approves
  this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:o4bPBdL5+JjDH2Xbb4m3XiC3wQYH30bPEjGNCIusgSit6//s8VXPORW9B/AhnradFgCNmoStPiO3yT+KoQWJBw==
- Task: HAL-5001

## What changes

`plugins.plugin-text` said a link in a `markdown` answer opens through `ExternalLink` and shows
its full address on hover. It now also says the link is followed by its host in muted text, such
as "(example.com)", outside the link. The host is the one the URL parser reads, with any port, so
an international name shows in its `xn--` form and an IP address as itself. The hover address
stays. The example for `See [the map](https://example.com/map)` names the host, and one example is
added for a look-alike name with a Cyrillic "а".

## Why

The plugin writes the link's words, so they can't be trusted to say where it goes, and a hover
`title` never reaches keyboard or touch users. `ExternalLink` doesn't ask before leaving Studio,
so the address has to show next to the link. The parser's host is what the browser will open:
`https://example.org@example.com/` shows "example.com", and a look-alike international name shows
as `xn--…` instead of a name that reads like a known site. An `http` or `https` address always
has a host, and the Markdown reader lets nothing else through, so there's no case without one.

No test was weakened or removed: the hover test is unchanged, and new tests cover the host, a
port, an IPv4 and an IPv6 address, an international name and an address with a user part.

## Covers

- plugins.plugin-text
