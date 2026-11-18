# tunnel-attacks.host-and-origin

- Status: active
- Since: unreleased
- Source: tunnel phase A4 of the plan "phone reaches a runtime host through pluggable tunnels", approved by the board on 11 Nov; task HAL-5687

The remote gateway shall make a WebSocket only of a request that names it by a `Host` it listens as (loopback with its own port, `localhost` with its own port, or the name of a tunnel it was told to accept) and that has no `Origin`, even when the request reaches it through a tunnel's forwarder from loopback, so a web page that points its own name at the tunnel or at this computer gets nothing. A refused request shall change nothing on the host.

## Examples

- Given a gateway behind a forwarder and a request whose `Host` is a name an attacker owns, such as `evil.example`, `127.0.0.1.evil.example` or `localhost.evil.example`,
  when the request reaches the gateway,
  then the answer is 421 and the connection ends.
- Given a `Host` with user information, a trailing dot, a trailing label or another port,
  then the answer is 421.
- Given a request with no `Host` or with a `Host` forwarded in `X-Forwarded-Host`,
  then no WebSocket is made.
- Given a request with two `Host` lines, whichever comes first,
  then no WebSocket is made.
- Given a request whose target is an absolute URL for another host,
  then no WebSocket is made.
- Given a tunnel name the gateway was not told to accept,
  then the answer is 421, and with the name listed (in any case) a phone is upgraded.
- Given a request with an `Origin` of any kind, the gateway's own address, `null`, `file://` or empty included,
  then the answer is 403.
