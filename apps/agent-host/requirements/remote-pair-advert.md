# agent-host.remote-pair-advert

- Status: active
- Since: unreleased
- Source: tunnel phase B build plan, decision 17 (HAL-12232); task HAL-12237; discovery spike D4 (HAL-12247)

While a pairing is open, the agent host shall advertise the service `_halonic-pair._tcp` over multicast DNS on the LAN, and at no other time. It shall join the group and send on one interface only, the one the gateway's LAN endpoint is on, and shall drop a query from an address that isn't on that interface's IPv4 subnet. The advertisement shall give the gateway's LAN port and the computer's IPv4 address on that interface under a random name of its own, and its TXT record shall hold the computer's name only, as a phone may show it: no key and no code. When the advertising starts, the agent host shall announce it twice, a second apart, and shall answer a PTR question for the service with every record of it; it shall answer no other question, not even one about its own records. It shall write every datagram it sends before it opens its socket, and send the answer at most once a second, counting the announcements, however many queries arrive. When the pairing ends, it shall send the records with no time to live, so phones drop them at once, and close its socket; if the pairing ends while the socket is still opening, it shall send nothing and close the socket once it opens. It shall have at most one socket open however often the advertising is started. If the socket can't be opened or a datagram can't be sent, then the agent host shall say why and go on pairing without it. It shall read only the questions of a standard query it can parse in full, and nothing of a response. It shall drop a whole message that is over 9000 bytes, claims more than 16 questions, has a question of a class other than IN, or has a name that runs past the end, is over 255 bytes, has a label that isn't UTF-8 or holds a dot, or follows a compression pointer that doesn't point further back or more than 16 pointers.

## Examples

- Given an open pairing on "Tim's laptop" with its gateway on port 4100,
  when a phone on the same Wi-Fi asks for `_halonic-pair._tcp.local`,
  then it gets the PTR record, and as additionals the SRV record with port 4100, the TXT record `name=Tim's laptop` and the A records.
- Given an advertisement,
  when the pairing ends,
  then the records go out again with no time to live and the socket is closed.
- Given an open pairing,
  when a message claims 65535 questions, or its name points forward to itself,
  then the host reads nothing from it and sends nothing.
- Given an advertisement that sent its answer or an announcement less than a second ago,
  when 1000 queries for the service arrive at once,
  then it sends nothing until a second has passed, and then one answer.
- Given an advertisement on 192.168.1.20 with netmask 255.255.255.0,
  when a query for the service comes from 10.0.0.5 or 172.17.0.1,
  then the host sends nothing; from 192.168.1.33, it answers.
- Given a pairing that ends while the socket is still opening,
  when the socket opens,
  then the host sends nothing on it and closes it.
- Given an address that isn't IPv4, or a netmask that isn't a run of ones,
  when a pairing opens,
  then the host opens no socket and says phones on this Wi-Fi won't list the computer.
- Given port 5353 can't be had,
  when a pairing opens,
  then the host says phones on this Wi-Fi won't list the computer, and the pairing goes on.
