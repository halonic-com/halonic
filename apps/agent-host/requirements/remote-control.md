# agent-host.remote-control

- Status: active
- Since: unreleased
- Source: tunnel phase B build plan, decisions 6, 10–13 and 17 (HAL-12232); task HAL-12237; requirement `contracts.remote-control`

The agent host's `RemoteControl` shall pass `contracts.remote-control` on the pairing rules (`agent-host.remote-pairing-rules`), the paired phones (`agent-host.remote-paired-phones`), the remote switches (`agent-host.remote-settings`), the host key (`agent-host.remote-host-key`) and a tunnel provider. While the host doesn't offer remote, it shall show remote off and refuse to turn remote on or open a pairing. Turning remote on shall start the tunnel, pointed only at the remote gateway's loopback port; turning it off shall stop it. When the host starts with remote left on, it shall start the tunnel again. A pairing's QR code shall hold the host key, the code, the host's name and the gateway's endpoints, the LAN endpoint first. When a code stops working, the pairing shall stay open and the tunnel up, and a new code shall be a new pairing at the pairing rules. A phone waiting for Allow shall hear `denied` when the person ends its code (Don't allow, a new code, closing the dialog, turning remote off), and `timed-out` when Allow wasn't pressed in time or it left, which the dialog shows as time running out. When the tunnel can't start or goes down, the pairing shall end with `tunnel-down` and the tunnel's reason. While a pairing is open, and only then, the host shall advertise it over multicast DNS on the LAN endpoint's interface (`agent-host.remote-pair-advert`).

## Examples

- Given a gateway on the Wi-Fi at 192.168.1.20 port 4200 and a tunnel, when a pairing opens, then its QR code lists `tcp://192.168.1.20:4200` first and the tunnel's endpoint second.
- Given an open pairing, when 5 minutes pass without a phone, then the code ends with `code-expired` and a new code can be shown.
- Given a phone at the check code, when 2 minutes pass, or its connection closes, then the code ends with `allow-timed-out` and the phone hears `timed-out`.
- Given a phone at the check code, when the person asks for a new code, then the phone hears `denied`.
- Given an open pairing that turned remote on, when the tunnel drops as `offline`, then the pairing ends with `tunnel-down` and `offline`, and remote is off again.
- Given a profile with remote left on, when the host starts, then the tunnel comes up.
