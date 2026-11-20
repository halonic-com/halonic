# agent-host.remote-pair-advert

- Status: active
- Since: unreleased
- Source: tunnel phase B build plan, decision 17 (HAL-12232); task HAL-12237; discovery spike D4 (HAL-12247)

While a pairing is open, the agent host shall advertise the service `_halonic-pair._tcp` over multicast DNS on the LAN, and at no other time. The advertisement shall give the gateway's LAN port and the computer's IPv4 addresses under a random name of its own, and its TXT record shall hold the computer's name only, as a phone may show it: no key and no code. When the advertising starts, the agent host shall announce it twice, a second apart, and shall answer a query for the service with every record of it; it shall answer no other query. When the pairing ends, it shall send the records with no time to live, so phones drop them at once, and close its socket. If the socket can't be opened or a datagram can't be sent, then the agent host shall say why and go on pairing without it. It shall read only the questions of a query it can parse in full, and nothing of a response.

## Examples

- Given an open pairing on "Tim's laptop" with its gateway on port 4100,
  when a phone on the same Wi-Fi asks for `_halonic-pair._tcp.local`,
  then it gets the PTR record, and as additionals the SRV record with port 4100, the TXT record `name=Tim's laptop` and the A records.
- Given an advertisement,
  when the pairing ends,
  then the records go out again with no time to live and the socket is closed.
- Given port 5353 can't be had,
  when a pairing opens,
  then the host says phones on this Wi-Fi won't list the computer, and the pairing goes on.
