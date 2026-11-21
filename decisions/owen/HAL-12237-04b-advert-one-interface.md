# Decision: the pairing advertisement uses only the phone's interface

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12237 (Liam, CTO, 20 Nov: the wiring items from the security review of #4139 on HAL-14098)
- Kind: internal

The security review of the pairing advertisement (#4139, HAL-14098) left three items for the wiring: drop queries whose source isn't on the computer's local subnet (RFC 6762 section 11), advertise and join the group only on the interface the phone shares, and make `start` and `stop` safe in any order.

**`agent-host.remote-pair-advert`** is tightened, nothing is loosened. The advertisement now gets one interface, the one the gateway's LAN endpoint is on, with its address and netmask, instead of a list of addresses. The socket joins the multicast group and sends on that interface only, the A record holds only its address, and a query from an address outside its subnet is dropped before it is read. A netmask that isn't one run of ones, or is all zeros (which would count every address as local), opens no socket. A `stop` while the socket is still opening sends nothing and closes it once it opens, and a second `start` opens no second socket. The example list gains a case for each.

## Covers

- agent-host.remote-pair-advert
