# studio.src-tauri.crates.phone-tunnel.phone-nearby

- Status: draft
- Since: unreleased
- Source: HAL-16824 (the typed route's computer picker, Liam's rules 3 and the D4 answer on HAL-12247)

When Android resolves a `_halonic-pair._tcp` hit for the computer picker, the phone shall keep it only if the `name` of its TXT record is a name the phone shows after pairing (at most 64 bytes of UTF-8, with no control, layout or invisible characters, trimmed and not empty), its address is an IPv4 address on the home network that isn't loopback, and its port isn't 0, and shall keep at most 16 computers. The page shall get each computer's name and an id the phone made, and never its address or port; an id shall never be given again, and a pairing started with an id shall go to the endpoint that id names, or answer `cant-reach` when the list no longer holds it.

## Examples

- Given a hit `name=Tim's laptop` at 192.168.1.20 port 4100,
  when the page gets the list,
  then it gets `{ "id": "nearby-1", "name": "Tim's laptop" }`, and pairing with `nearby-1` goes to `tcp://192.168.1.20:4100`.
- Given a hit at 127.0.0.1, 8.8.8.8, 100.101.102.103 or an IPv6 address,
  when it resolves,
  then it isn't listed.
- Given a hit whose name holds U+202E or is 65 bytes long,
  when it resolves,
  then it isn't listed.
- Given a listed computer whose hit now resolves to 127.0.0.1,
  when the page gets the list,
  then the computer is gone and its id names nothing.
- Given 20 computers on the Wi-Fi,
  when they resolve,
  then 16 are listed.
- Given the list was cleared,
  when the same computer is found again,
  then it gets a new id and the old one names nothing.
