# Decision: one LAN socket in the agent host, for the pairing advertisement

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14072 (Liam, CTO; the B2 plan for HAL-12237, with the conditions for PR 6)
- Kind: internal

Tunnel phase B, build plan decision 17 (HAL-12232): while Pair a phone is open, the agent host advertises `_halonic-pair._tcp` over multicast DNS, so a phone on the same Wi-Fi can list the computer. A multicast DNS socket receives from the LAN by its nature, and the active requirement `agent-host.loopback-only` says nothing of the host listens beyond this computer. Its guard test matched only `.listen(` calls, so it wouldn't have caught a datagram socket.

**`agent-host.loopback-only`** gains one exception and a stricter guard. The exception is `apps/agent-host/src/remote/mdns-socket.ts`, open only while a pairing is. It reads only the questions of a standard query within strict limits (`agent-host.remote-pair-advert`), and answers only a PTR question for the pairing service, with the computer's name, the gateway's LAN port and addresses: no key, no code. The reply is fixed bytes built before the socket opens (if they can't be built, no socket opens), and it goes out at most once a second, counting the announcements, however many queries arrive. The guard now also fails on any file of the sealed packages that imports `node:dgram`, other than that one. Nothing else is loosened: every `listen` rule stands. Answering about our own records is pre-approved: if D4 or the phone side shows Android's resolve asks for the instance's SRV or TXT record (or A or ANY for the target), the host may also answer a question whose name is exactly one of its own record names (the instance or the target) and whose type is SRV, TXT, A or ANY, with the same pre-encoded fixed bytes, under the same once-a-second limit, and with a test for each; that change needs a normal review, not a new security round. The alternatives were the Rust shell (an mDNS crate that isn't approved) or no LAN listing in phase B.

## Covers

- agent-host.loopback-only
